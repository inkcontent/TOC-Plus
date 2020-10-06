importScripts('../inkapi.js')

let pos = [];
let ranges = [];

INKAPI.ready(() => {
  const UI = INKAPI.ui;

  //your code here
  UI.menu.addMenuItem(doExport, "File", "Export", "as TOC")

});

async function doExport() {
  pos = [];
  ranges = [];
  const IO = INKAPI.io;
  const Editor = INKAPI.editor;
  const htmlStr = await Editor.getHTML();
  //extract h2, ... ,h6 here
  const converted = htmlStr.match(/<h[2-6][^>]*?>(?<TagText>.*?)<\/h[2-6]>/g) || [];
  const toc = converted.map(extractHeadingContent).join("\n");
  IO.saveFile(toc, 'toc');
}

function extractHeadingContent(t) {
  const position = setPos(+t[2]);
  const matched = t.match(/(?<=\>)(?!\<)(.*)(?=\<)(?<!\>)/g);
  return `${position} - ${matched ? matched[0] : ''}`
}

// Generate position for each heading like 1.1 or 1.2.3
function setPos(num) {
  if (!pos[0]) {
    pos[0] = num;
    ranges[0] = 1;
    return '1';
  }
  const index = pos.findIndex((n) => n === num);
  if (index === -1) {
    for (let i = 0; i < pos.length; i++) {
      if (num < pos[i]) {
        ranges[i]++;
        ranges.splice(i + 1);
        pos.splice(i + 1);
        pos[i] = num;
        return ranges.join('.');
      }
    }
    pos.push(num);
    ranges.push(1);
    return ranges.join('.');
  }
  ranges[index]++;
  ranges.splice(index + 1);
  pos.splice(index + 1);
  return ranges.join('.');
}
