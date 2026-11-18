import test from "node:test";
import assert from "node:assert/strict";
import JsBarcode from "jsbarcode";
import zxing from "@zxing/library";
const { Code128Reader, BitArray } = zxing;
test("printed Code 128 data decodes to the exact unit identity", () => {
  for (const code of ["KP-BSL-PK-OS-0001", "KP-CYL-PK-OS-0001", "KP-CLB-BR-M-10000", "KPLWB-7"]) {
    const output = {};
    JsBarcode(output, code, { format: "CODE128" });
    const bits = "0".repeat(20) + output.encodings.map((x) => x.data).join("") + "0".repeat(20);
    const row = new BitArray(bits.length);
    [...bits].forEach((bit, index) => {
      if (bit === "1") row.set(index);
    });
    assert.equal(new Code128Reader().decodeRow(0, row).getText(), code);
  }
});
