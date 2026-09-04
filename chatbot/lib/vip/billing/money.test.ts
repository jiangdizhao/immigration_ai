import assert from "node:assert/strict";
import { test } from "node:test";

import { formatMinorAmountAsAud, parsePriceInputToMinorUnits } from "./money";

test("decimal price strings convert to integer minor units", () => {
  assert.equal(parsePriceInputToMinorUnits("99"), 9900);
  assert.equal(parsePriceInputToMinorUnits("99.9"), 9990);
  assert.equal(parsePriceInputToMinorUnits("99.90"), 9990);
  assert.equal(parsePriceInputToMinorUnits("0.5"), 50);
  assert.equal(parsePriceInputToMinorUnits(" 120.25 "), 12_025);
});

test("invalid price inputs are rejected", () => {
  assert.equal(parsePriceInputToMinorUnits("0"), null);
  assert.equal(parsePriceInputToMinorUnits("0.00"), null);
  assert.equal(parsePriceInputToMinorUnits("-1"), null);
  assert.equal(parsePriceInputToMinorUnits("1.234"), null);
  assert.equal(parsePriceInputToMinorUnits("abc"), null);
  assert.equal(parsePriceInputToMinorUnits(""), null);
  assert.equal(parsePriceInputToMinorUnits("99."), null);
  assert.equal(parsePriceInputToMinorUnits(".5"), null);
  assert.equal(parsePriceInputToMinorUnits("NaN"), null);
  assert.equal(parsePriceInputToMinorUnits("Infinity"), null);
  assert.equal(parsePriceInputToMinorUnits("1e3"), null);
  assert.equal(parsePriceInputToMinorUnits("99999999999999999999"), null);
});

test("formatting uses integer math, not floating point", () => {
  assert.equal(formatMinorAmountAsAud(9900), "A$99.00");
  assert.equal(formatMinorAmountAsAud(9990), "A$99.90");
  assert.equal(formatMinorAmountAsAud(50), "A$0.50");
  assert.equal(formatMinorAmountAsAud(123_456_789), "A$1234567.89");
  assert.throws(() => formatMinorAmountAsAud(0));
  assert.throws(() => formatMinorAmountAsAud(-1));
  assert.throws(() => formatMinorAmountAsAud(1.5));
});
