const fs = require("node:fs");
const path = require("node:path");

const packageInfo = require("../package.json");
const name = packageInfo.name.split("/").at(-1);
const batFilePath = `C:/windows/${name}.bat`;

fs.writeFileSync(batFilePath, `
@echo off
node "${path.resolve(__dirname, "..", "main.js")}" %*
`);

console.log(`${batFilePath} created`);
