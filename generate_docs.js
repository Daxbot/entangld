const fs=require("fs");
const jsdoc2md=require("jsdoc-to-markdown");

const template="# API reference\n\n{{>main}}\n";

jsdoc2md.render({files: "lib/*.js", template})
	.then(output=> fs.writeFileSync("API.md", output));
