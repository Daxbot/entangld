const fs=require("fs");
const jsdoc2md=require("jsdoc-to-markdown");

const templatefile=fs.readFileSync("README.hbs", "utf8");

jsdoc2md.render({files: "lib/*.js", template:templatefile})
	.then(output=> fs.writeFileSync("README.md", output));
