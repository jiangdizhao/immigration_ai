/** Emit only fixture IDs and safe policy decisions for backend/browser parity. */

import {
  evaluatePoliticalText,
  politicalGateIdentity,
} from "../lib/political-gate";
import fixtures from "../tests/fixtures/political-gate-fixtures.json";

type FixtureCase = {
  id: string;
  text: string;
};

const policyFixtures = fixtures as {
  cases: FixtureCase[];
  never_standalone_terms: string[];
};

const evaluate = (id: string, text: string) => ({
  decision: evaluatePoliticalText(text).decision,
  id,
});

console.log(
  JSON.stringify({
    cases: policyFixtures.cases.map((fixture) =>
      evaluate(fixture.id, fixture.text)
    ),
    identity: politicalGateIdentity,
    neverStandalone: policyFixtures.never_standalone_terms.map((term, index) =>
      evaluate(`never-${index}`, term)
    ),
  })
);
