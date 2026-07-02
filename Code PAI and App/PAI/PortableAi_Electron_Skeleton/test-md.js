const txt1 = "<think>Here is some thought";
const txt2 = "<think>Here is some thought</think>And then actual text";
const pattern = /<think>([\s\S]*?)(?:<\/think>|$)/gi;

function testParse(txt) {
  const think = [];
  let s = txt.replace(pattern, (match, inner) => {
    think.push(inner.trim());
    const isOpen = !match.toLowerCase().endsWith('</think>');
    return `\n\n[[[THINK_${think.length - 1}${isOpen ? '_OPEN' : ''}]]]\n\n`;
  });
  console.log("Original:", txt);
  console.log("Replaced:", s);
  console.log("Think array:", think);
  
  // mock renderBlock
  let out = s;
  const thinkM = s.match(/\[\[\[THINK_(\d+)(_OPEN)?\]\]\]/);
  if (thinkM) {
    const isOpen = !!thinkM[2];
    out = `<details class="thinking" ${isOpen ? 'open' : ''}><summary>Thinking...</summary><div class="think">${think[+thinkM[1]]}</div></details>`;
  }
  console.log("Final DOM:", out);
  console.log("---------");
}

testParse(txt1);
testParse(txt2);
