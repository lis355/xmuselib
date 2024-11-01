// TODO сделать свою либу для ID3
// node-id3 либа почему то игнорирует неопределенные для нее тэги
const ID3Definitions = require("node-id3/src/ID3Definitions");
ID3Definitions.FRAME_IDENTIFIERS.v3.compilation = "TCMP";
ID3Definitions.FRAME_IDENTIFIERS.v4.compilation = "TCMP";
ID3Definitions.FRAME_INTERNAL_IDENTIFIERS.v3.TCMP = "compilation";
ID3Definitions.FRAME_INTERNAL_IDENTIFIERS.v4.TCMP = "compilation";

const NodeID3 = require("node-id3");

module.exports = NodeID3;
