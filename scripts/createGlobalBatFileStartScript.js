const fs = require("node:fs");
const path = require("node:path");

const packageInfo = require("../package.json");
const name = packageInfo.name.split("/").at(-1);

fs.writeFileSync(`C:/windows/${name}.bat`, `
@echo off
node "${path.resolve(__dirname, "..", "main.js")}" %*
`);
