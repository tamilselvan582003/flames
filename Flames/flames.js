
import os, sys
import re
import json
import sqlite3
import tempfile
from typing import Dict, Any

import pandas as pd
import streamlit as st
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from httpx import Client as HTTPClient  # For `clients` instance

tiktoken_cache_dir = "./tiktoken_cache"
os.environ["TIKTOKEN_CACHE_DIR"] = tiktoken_cache_dir

load_dotenv()

API_KEY = os.getenv("API_KEY", "")
if not API_KEY:
    st.error("Please set API_KEY in your .env file.")
    st.stop()

os.environ["STREAMLIT_WATCHER_TYPE"] = "none"
sys.modules["torch.classes"] = None 

# Create reusable http client
clients = HTTPClient(timeout=60.0, verify=False)

# Initialize ChatOpenAI using TCS GenAI endpoint
llm = ChatOpenAI(
    base_url="https://genailab.tcs.in",
    model="azure/genailab-maas-gpt-4.1-mini",
    api_key=API_KEY,
    http_client=clients
)

st.set_page_config(page_title="Retail Inventory Chatbot", page_icon="🛒")


SCHEMA_TEXT = """
    You have access to a SQLite database with a single table:

    Table: inventory
    Columns:
    - ProductID VARCHAR(10)
    - ProductName VARCHAR(30)
    - StockLevel INTEGER
    - ReorderThreshold INTEGER
    - Cost_INR INTEGER
    - LocationID VARCHAR(30)

    Business rules:
    - Low stock: StockLevel < ReorderThreshold
    - Reorder quantity (simple rule): reorder_qty = ReorderThreshold - StockLevel
    - Reorder recommendation should be with detailed explaination
    - Only generate safe, read-only SQL. STRICTLY SELECT queries.
    - Always include column names in SELECT and keep it succinct.
    """

SYSTEM_INSTRUCTIONS = f"""
    You are a Retail Inventory AI. 
    Goal: Convert natural language queries into a single, safe SELECT SQL for the schema below,
    and return a compact JSON plan. DO NOT execute SQL yourself.

    {SCHEMA_TEXT}

    Return ONLY valid JSON with this schema:
    {{
    "sql": "<SELECT statement>",
    "purpose": "<one-liner of what the SQL retrieves>",
    "fields_needed": ["list","of","columns"],
    "filters": "<human-friendly filter summary>"
    }}

    Rules:
    - Absolutely no INSERT/UPDATE/DELETE/PRAGMA/ATTACH/CREATE/DROP/ALTER/TRUNCATE.
    - No multiple statements. One SELECT only.
    - If the best response needs no SQL (pure reasoning), still return a SELECT that inspects inventory (e.g., Summary stock).
    - Prefer TOP-level aggregates only when asked (SUM/AVG/etc).
    - Use LIKE for fuzzy name searches when the user is unsure (e.g., ProductName LIKE '%shirt%').
    - Output must contain valid and correct numbers as present in the database. 

    Output Guidelines:
    - Output should be valid and correct numbers as present in the database.
    - Output should not contain any false information which are not present in the database.
    """

USER_HELP = """
    Example queries:
    - "Show inventory summary"
    - "Which products need reordering?"
    - "Reorder recommendations"
    - "Show an alert for the products which are of Low stock"
    """

REQUIRED_COLS = [
    "ProductID",
    "ProductName",
    "StockLevel",
    "ReorderThreshold",
    "Cost_INR",
    "LocationID"
]

COLUMN_ALIASES = {
    "ProductID": ["productid", "sku", "item_code", "product_code"],
    "ProductName": ["productname", "name", "item_name", "product_title"],
    "StockLevel": ["stocklevel", "stock_qty", "quantity", "on_hand", "qty"],
    "ReorderThreshold": ["reorderthreshold", "reorder_point", "rop", "reorderlevel"],
    "Cost_INR": ["cost_inr", "price", "cost", "unit_cost", "cost_price"],
    "LocationID": ["locationid", "location", "store_id", "warehouse", "branch"]
}

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
        .str.replace(r"[^a-z0-9]+", "_", regex=True)
        .str.strip("_")
    )

    alias_to_key = {}
    for key, aliases in COLUMN_ALIASES.items():
        for a in aliases:
            alias_to_key[a] = key.lower()

    rename_map = {}
    for col in df.columns:
        if col in alias_to_key:
            rename_map[col] = alias_to_key[col]
    df = df.rename(columns=rename_map)

    for col in REQUIRED_COLS:
        if col.lower() not in df.columns:
            df[col.lower()] = ""

    df = df[[c.lower() for c in REQUIRED_COLS]]
    df.columns = REQUIRED_COLS

    df["StockLevel"] = pd.to_numeric(df["StockLevel"], errors="coerce").fillna(0).astype(int)
    df["ReorderThreshold"] = pd.to_numeric(df["ReorderThreshold"], errors="coerce").fillna(0).astype(int)
    df["Cost_INR"] = pd.to_numeric(df["Cost_INR"], errors="coerce").fillna(0).astype(int)
    df["ProductID"] = df["ProductID"].astype(str).fillna("").str.strip()
    df["ProductName"] = df["ProductName"].astype(str).fillna("").str.strip()
    df["LocationID"] = df["LocationID"].astype(str).fillna("").str.strip()
    return df


def create_db_from_excel(file) -> str:
    raw = pd.read_excel(file, engine="openpyxl")
    df = normalize_columns(raw)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    db_path = tmp.name
    tmp.close()

    con = sqlite3.connect(db_path)
    try:
        con.execute("""
            CREATE TABLE IF NOT EXISTS inventory (
                ProductID VARCHAR(10),
                ProductName VARCHAR(30),
                StockLevel INTEGER,
                ReorderThreshold INTEGER,
                Cost_INR INTEGER,
                LocationID VARCHAR(30)
            );
        """)
        df.to_sql("inventory", con, if_exists="replace", index=False)
    finally:
        con.close()

    return db_path


def run_sql(db_path: str, sql: str) -> pd.DataFrame:
    if not sql.strip().lower().startswith("select"):
        raise ValueError("Only SELECT statements are allowed.")
    banned = ["pragma", "attach", "insert", "update", "delete", "create", "drop", "alter", "truncate"]
    low = sql.lower()
    if any(b in low for b in banned):
        raise ValueError("Unsafe SQL keyword detected.")
    con = sqlite3.connect(db_path)
    try:
        df = pd.read_sql_query(sql, con)
    finally:
        con.close()
    return df


def llm_json(prompt: str) -> Dict[str, Any]:
    messages = [
        {"role": "system", "content": SYSTEM_INSTRUCTIONS},
        {"role": "user", "content": USER_HELP + "\n\nManager query:\n" + prompt.strip()}
    ]
    resp = llm.invoke(messages)  
    return json.loads(resp.content)


def llm_answer(user_query: str, df_preview: str, row_count: int) -> str:
    summary_prompt = f"""
    You are a Retail Inventory Analyst.
    Manager asked: {user_query}

    Here is the SQL result (CSV-like preview):
    {df_preview}

    Number of rows returned by the SQL: {row_count}

    If possible:
    1) Provide a 3-6 bullet summary of insights.
    2) Highlight low-stock products (StockLevel < ReorderThreshold).
    3) Suggest reorder quantities = (ReorderThreshold - StockLevel) if > 0.
    4) Keep it concise and business-friendly.
    5) Output must contain valid and correct numbers as present in the database.
    """
    messages = [
        {"role": "system", "content": "You write concise, actionable summaries for inventory managers."},
        {"role": "user", "content": summary_prompt}
    ]
    resp = llm.invoke(messages)
    return resp.content


def df_markdown_preview(df: pd.DataFrame, max_rows: int = 25) -> str:
    if df.empty:
        return "(no rows)"
    return df.head(max_rows).to_csv(index=False)

st.title("🛒 Retail Inventory Chatbot")

with st.sidebar:
    st.subheader("Upload your Inventory Excel")
    uploaded = st.file_uploader("Choose a file (.xlsx)", type=["xlsx"])

    if uploaded:
        try:
            db_path = create_db_from_excel(uploaded)
            st.session_state.db_path = db_path
            st.success("✅ SQLite database created from Excel file")
        except Exception as e:
            st.error(f"Failed to process Excel: {e}")

    if "db_path" in st.session_state:
        st.caption(f"Runtime DB: `{st.session_state.db_path}`")
        if st.button("Example SQL"):
            st.code("SELECT * FROM inventory WHERE StockLevel < ReorderThreshold ORDER BY StockLevel;", language="sql")

st.divider()

if "db_path" not in st.session_state:
    st.info("📁 Please upload an Excel file to get started.")
    st.stop()

# Chat interface
user_query = st.chat_input("Type your inventory question…")

if user_query:
    with st.chat_message("user"):
        st.markdown(user_query)

    try:
        plan = llm_json(user_query)
        sql = plan.get("sql", "").strip()
        purpose = plan.get("purpose", "")
        filters = plan.get("filters", "")
        # Ensure DISTINCT is used
        if sql.lower().startswith("select ") and not sql.lower().startswith("select distinct"):
            sql = "SELECT DISTINCT" + sql[6:]
    except Exception as e:
        st.error(f"⚠️ LLM failed to generate SQL: {e}")
        st.stop()

    try:
        df = run_sql(st.session_state.db_path, sql)
    except Exception as e:
        st.error(f"⚠️ SQL Error: {e}\n\nSQL:\n{sql}")
        st.stop()

    preview_text = df_markdown_preview(df)
    row_count = len(df)
    answer = llm_answer(user_query, preview_text, row_count)

    with st.chat_message("assistant"):
        if purpose:
            st.caption(f"**Purpose:** {purpose} · **Filters:** {filters}")
        st.markdown(answer)
        with st.expander("SQL used"):
            st.code(sql, language="sql")
        with st.expander("Result Preview"):
            st.dataframe(df, use_container_width=True)
