const fs = require("node:fs");

const packageInfo = require("../package.json");
const name = packageInfo.name.split("/").at(-1);
const batFilePath = `C:/windows/${name}.bat`;

fs.unlinkSync(`C:/windows/${name}.bat`);

console.log(`${batFilePath} removed`);
