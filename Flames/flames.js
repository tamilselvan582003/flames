function check(name)
{
	let new_name = name.value;

            	if(!isNaN(new_name))
            	{
            		new_name = new_name.substring(0,(new_name.length-1));
            		name.value = new_name;
            	}
}
function calc()
{
	let fname = document.getElementById('yname').value;
	let sname = document.getElementById('pname').value;
	if (fname=='') {
		alert("Enter First Name");
	}
	else if (sname=='') {
		alert("Enter Second Name");
	}

    let r = /\s+/g;
    let orfirst = document.first.name.value.toUpperCase();
    let nam=orfirst;
    orfirst = orfirst.replace(r,"");
    if(orfirst!="")
    {
			let count = 0;
            let first = orfirst;
            second = eval("document.first.name"+1).value.toUpperCase();
            let names=second;
            second = second.replace(r,"");
            if(second != "")
            {
                document.getElementById("result").style.display = 'block';
                    for(let i=0; i<first.length; i++)
                    {
                            for(let j=0; j<second.length; j++)
                            {
                                    if(first[i] == second[j])
                                    {
                                            let a1 = first.substring(0,i);
                                            let a2 = first.substring(i+1,first.length);
                                            first = a1+a2;
                                            i=-1;
                                            let b1 = second.substring(0,j);
                                            let b2 = second.substring(j+1,second.length);
                                            second = b1+b2;
                                            j=-1;
                                            break;
                                    }
                            }
                    }

                    var ss=(first+second);
                    var l=ss.length;
                    var ar = new Array("F", "L", "A", "M", "E", "S");
                    var stp=1;

                    for(var x=6; x>1; x--)
                    {
                            var g=((l%x)+stp)-1;
                            if(g>x)
                            {
                                    g=g%x;
                            }
                            if(g==0)
                            {
                                    g=ar.length;
                            }
                            ar.splice(g-1,1);
                            stp=g;
                    }

                    if(ar=="F")
                    {
							document.getElementById("display_flame").innerHTML = 'FRIENDS &#9996';
							document.getElementById("display_flame").style.color='red';

                    }
                    else if(ar=="L")
                    {
							document.getElementById("display_flame").innerHTML = 'LOVER &#128151';
							document.getElementById("display_flame").style.color='red';
                    }
                    else if(ar=="A")
                    {
                            
							document.getElementById("display_flame").innerHTML = 'AFFECTION &#128516';
							document.getElementById("display_flame").style.color='red';
                    }
                    else if(ar=="M")
                    {
                            
							document.getElementById("display_flame").innerHTML = 'MARRIAGE &#128107';
							document.getElementById("display_flame").style.color='red';
                    }
                    else if(ar=="E")
                    {
                            
							document.getElementById("display_flame").innerHTML = 'ENEMY &#128545';
							document.getElementById("display_flame").style.color='red';
                    }
                    else if(ar=="S")
                    {
							document.getElementById("display_flame").innerHTML = 'SISTER &#127752';
							document.getElementById("display_flame").style.color='red';
                    }
                    document.getElementById("nam"+1).style.display = 'block';
                    document.getElementById("nam"+1).textContent= "Relationship status of " +nam + " & " +names+ " is :";
            }
    }
    else
    {
            return false;
    }
}    df["ProductName"] = df["ProductName"].astype(str).fillna("").str.strip()
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
