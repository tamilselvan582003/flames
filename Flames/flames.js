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
}
