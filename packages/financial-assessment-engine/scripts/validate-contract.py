#!/usr/bin/env python3
"""Validate FinancialAssessmentV1 goldens with a non-TypeScript consumer."""

from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = PACKAGE_ROOT / "schema" / "financial-assessment-v1.schema.json"
FIXTURE_ROOT = PACKAGE_ROOT / "fixtures"


def main() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(
        schema,
        format_checker=FormatChecker(),
    )
    fixture_paths = sorted(
        FIXTURE_ROOT.glob("*/financial-assessment-v1.json")
    )
    if not fixture_paths:
        raise RuntimeError("No FinancialAssessmentV1 golden fixtures found")

    for fixture_path in fixture_paths:
        assessment = json.loads(fixture_path.read_text(encoding="utf-8"))
        errors = sorted(
            validator.iter_errors(assessment),
            key=lambda error: list(error.absolute_path),
        )
        if errors:
            details = "\n".join(
                f"{fixture_path.name}:{list(error.absolute_path)}: "
                f"{error.message}"
                for error in errors
            )
            raise AssertionError(details)

        issue_keys = [
            finding["issueKey"] for finding in assessment["findings"]
        ]
        occurrence_ids = [
            finding["occurrenceId"] for finding in assessment["findings"]
        ] + [
            decision["occurrenceId"] for decision in assessment["decisions"]
        ]
        if len(issue_keys) != len(set(issue_keys)):
            raise AssertionError(f"{fixture_path}: duplicate issue keys")
        if len(occurrence_ids) != len(set(occurrence_ids)):
            raise AssertionError(
                f"{fixture_path}: duplicate occurrence identifiers"
            )
        if any(
            finding["issueClass"] == "migration_decision"
            for finding in assessment["findings"]
        ):
            raise AssertionError(
                f"{fixture_path}: migration decision emitted as a finding"
            )
        if any(
            decision["issueClass"] != "migration_decision"
            for decision in assessment["decisions"]
        ):
            raise AssertionError(
                f"{fixture_path}: invalid decision classification"
            )

    print(
        f"Validated {len(fixture_paths)} FinancialAssessmentV1 fixtures "
        "against Draft 2020-12 JSON Schema."
    )


if __name__ == "__main__":
    main()
