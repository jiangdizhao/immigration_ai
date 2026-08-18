"""Phase 4B — Deterministic utility tool.

In-process Decimal/date/unit calculations with a restricted parser.

Operations:
- arithmetic: +, -, *, / with Decimal precision
- percentage: (value / total) * 100
- date_add: Add days/months/years to a date
- date_difference: Difference between dates
- unit_convert: Unit conversions

MANDATORY RULES:
- Decimal for financial/date arithmetic (no binary float)
- Restricted parser only; NO Python eval()
- No arbitrary code execution
- Handle leap years, month/year boundaries correctly
- Handle timezone/DST correctly (Australia/Sydney)
- Reject nonexistent/ambiguous datetime assumptions
- Return normalized inputs and assumptions
- Calculation trace is NON-EXECUTABLE descriptive data

The utility does NOT decide:
- Which legal deadline applies
- Which legal rule applies
- Which start date applies
- Whether a day legally counts
- Current fees
- Visa eligibility

Business-day calculations require an approved holiday calendar.
If unavailable, return controlled unsupported_calendar error.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo

from app.schemas.tools import DeterministicUtilityOutput, DeterministicUtilityRequest

UTILITY_VERSION = "deterministic_utility.v1"
SYDNEY_TZ = ZoneInfo("Australia/Sydney")

# Supported rounding modes
ROUNDING_MODES = {
    "none": None,
    "floor": ROUND_FLOOR,
    "ceil": ROUND_CEILING,
    "half_up": ROUND_HALF_UP,
}

# Supported unit conversions (from_unit, to_unit, factor)
UNIT_CONVERSIONS: dict[tuple[str, str], Decimal] = {
    ("km", "m"): Decimal("1000"),
    ("m", "km"): Decimal("0.001"),
    ("kg", "g"): Decimal("1000"),
    ("g", "kg"): Decimal("0.001"),
    ("lb", "kg"): Decimal("0.45359237"),
    ("kg", "lb"): Decimal("2.2046226218"),
    ("mile", "km"): Decimal("1.609344"),
    ("km", "mile"): Decimal("0.621371192"),
    ("inch", "cm"): Decimal("2.54"),
    ("cm", "inch"): Decimal("0.393700787"),
    ("foot", "m"): Decimal("0.3048"),
    ("m", "foot"): Decimal("3.280839895"),
    ("yard", "m"): Decimal("0.9144"),
    ("m", "yard"): Decimal("1.093613298"),
    ("hour", "minute"): Decimal("60"),
    ("minute", "hour"): Decimal("0.016666667"),
    ("day", "hour"): Decimal("24"),
    ("hour", "day"): Decimal("0.041666667"),
    ("week", "day"): Decimal("7"),
    ("day", "week"): Decimal("0.142857143"),
    ("aud", "usd"): None,  # Requires external rate; not supported
    ("usd", "aud"): None,
}


class UtilityError(Exception):
    """Error in deterministic utility."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class InvalidExpressionError(UtilityError):
    def __init__(self, reason: str) -> None:
        super().__init__(
            code="INVALID_EXPRESSION",
            message=f"Invalid expression: {reason}",
        )


class UnsupportedCalendarError(UtilityError):
    def __init__(self, calendar: str) -> None:
        super().__init__(
            code="UNSUPPORTED_CALENDAR",
            message=f"Calendar '{calendar}' is not supported without an approved holiday calendar",
        )


class InvalidDateError(UtilityError):
    def __init__(self, reason: str) -> None:
        super().__init__(
            code="INVALID_DATE",
            message=f"Invalid date: {reason}",
        )


class DivisionByZeroError(UtilityError):
    def __init__(self) -> None:
        super().__init__(
            code="DIVISION_BY_ZERO",
            message="Division by zero",
        )


# ---------------------------------------------------------------------------
# Restricted arithmetic expression parser (NO eval)
# ---------------------------------------------------------------------------

# Allowed tokens: numbers, operators, parentheses, whitespace
TOKEN_RE = re.compile(r"^\s*([\d.]+|[+\-*/()])\s*$")

# Expression pattern: numbers, operators, parentheses only
SAFE_EXPRESSION_RE = re.compile(r"^[\d\s+\-*/().]+$")


def parse_arithmetic_expression(expr: str) -> Decimal:
    """Parse and evaluate a restricted arithmetic expression.

    Supports: +, -, *, /, parentheses, decimal numbers.
    NO eval(), NO arbitrary code execution.

    Uses a simple recursive descent parser.
    """
    if not SAFE_EXPRESSION_RE.match(expr):
        raise InvalidExpressionError("Expression contains invalid characters")

    # Tokenize
    tokens: list[str] = []
    current = ""
    for char in expr:
        if char.isspace():
            if current:
                tokens.append(current)
                current = ""
        elif char in "+-*/()":
            if current:
                tokens.append(current)
                current = ""
            tokens.append(char)
        else:
            current += char
    if current:
        tokens.append(current)

    if not tokens:
        raise InvalidExpressionError("Empty expression")

    # Recursive descent parser
    pos = 0

    def peek() -> str | None:
        nonlocal pos
        return tokens[pos] if pos < len(tokens) else None

    def consume() -> str:
        nonlocal pos
        if pos >= len(tokens):
            raise InvalidExpressionError("Unexpected end of expression")
        token = tokens[pos]
        pos += 1
        return token

    def parse_number() -> Decimal:
        token = consume()
        try:
            return Decimal(token)
        except InvalidOperation:
            raise InvalidExpressionError(f"Invalid number: {token}")

    def parse_factor() -> Decimal:
        token = peek()
        if token == "(":
            consume()
            result = parse_expression()
            if peek() != ")":
                raise InvalidExpressionError("Missing closing parenthesis")
            consume()
            return result
        elif token == "-":
            consume()
            return -parse_factor()
        elif token == "+":
            consume()
            return parse_factor()
        else:
            return parse_number()

    def parse_term() -> Decimal:
        result = parse_factor()
        while peek() in ("*", "/"):
            op = consume()
            right = parse_factor()
            if op == "*":
                result = result * right
            else:
                if right == 0:
                    raise DivisionByZeroError()
                result = result / right
        return result

    def parse_expression() -> Decimal:
        result = parse_term()
        while peek() in ("+", "-"):
            op = consume()
            right = parse_term()
            if op == "+":
                result = result + right
            else:
                result = result - right
        return result

    result = parse_expression()
    if pos != len(tokens):
        raise InvalidExpressionError("Unexpected tokens after expression")
    return result


# ---------------------------------------------------------------------------
# Date operations
# ---------------------------------------------------------------------------


def parse_date(value: str) -> date:
    """Parse a date string (YYYY-MM-DD)."""
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise InvalidDateError(f"Cannot parse date: {value}") from exc


def add_days(start: date, days: int) -> date:
    """Add calendar days to a date."""
    return start + timedelta(days=days)


def add_months(start: date, months: int) -> date:
    """Add months to a date, handling month/year boundaries.

    If the resulting day doesn't exist (e.g., Jan 31 + 1 month),
    clamp to the last day of the target month.
    """
    month = start.month - 1 + months
    year = start.year + month // 12
    month = month % 12 + 1

    # Clamp day to valid range for target month
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    last_day = (next_month - timedelta(days=1)).day

    day = min(start.day, last_day)
    return date(year, month, day)


def add_years(start: date, years: int) -> date:
    """Add years to a date, handling leap years."""
    try:
        return start.replace(year=start.year + years)
    except ValueError:
        # Feb 29 in non-leap year
        return date(start.year + years, 2, 28)


def date_difference_days(start: date, end: date) -> int:
    """Calculate difference in calendar days."""
    return (end - start).days


# ---------------------------------------------------------------------------
# Main utility function
# ---------------------------------------------------------------------------


def execute_utility(request: DeterministicUtilityRequest) -> DeterministicUtilityOutput:
    """Execute a deterministic utility operation.

    Returns typed result with normalized inputs and assumptions.
    Raises UtilityError on invalid input.
    """
    operation = request.operation
    operands = request.operands
    precision = request.precision
    rounding_mode = ROUNDING_MODES.get(request.rounding)

    assumptions: list[str] = []
    normalized_inputs: list[Any] = []

    if operation == "arithmetic":
        # Arithmetic via expression or operands
        if request.expression:
            result = parse_arithmetic_expression(request.expression)
            normalized_inputs = [request.expression]
            trace = f"arithmetic: {request.expression}"
        elif len(operands) >= 2:
            # Simple binary operation: [op, a, b] or [a, op, b]
            if len(operands) == 3 and isinstance(operands[1], str):
                a, op, b = Decimal(str(operands[0])), operands[1], Decimal(str(operands[2]))
            else:
                raise UtilityError("INVALID_OPERANDS", "Arithmetic requires expression or [a, op, b]")

            if op == "+":
                result = a + b
            elif op == "-":
                result = a - b
            elif op == "*":
                result = a * b
            elif op == "/":
                if b == 0:
                    raise DivisionByZeroError()
                result = a / b
            else:
                raise UtilityError("INVALID_OPERATOR", f"Unknown operator: {op}")

            normalized_inputs = [str(a), op, str(b)]
            trace = f"arithmetic: {a} {op} {b}"
        else:
            raise UtilityError("INVALID_OPERANDS", "Arithmetic requires expression or operands")

        # Apply rounding
        if rounding_mode:
            result = result.quantize(Decimal(10) ** -precision, rounding=rounding_mode)

        return DeterministicUtilityOutput(
            result_type="number",
            result=str(result),
            normalized_inputs=normalized_inputs,
            assumptions=assumptions,
            timezone=request.timezone,
            calculation_trace=trace,
            utility_version=UTILITY_VERSION,
        )

    elif operation == "percentage":
        if len(operands) != 2:
            raise UtilityError("INVALID_OPERANDS", "Percentage requires [value, total]")

        value = Decimal(str(operands[0]))
        total = Decimal(str(operands[1]))

        if total == 0:
            raise DivisionByZeroError()

        result = (value / total) * Decimal("100")
        if rounding_mode:
            result = result.quantize(Decimal(10) ** -precision, rounding=rounding_mode)

        return DeterministicUtilityOutput(
            result_type="number",
            result=str(result),
            normalized_inputs=[str(value), str(total)],
            assumptions=["percentage = (value / total) * 100"],
            timezone=request.timezone,
            calculation_trace=f"percentage: ({value} / {total}) * 100",
            utility_version=UTILITY_VERSION,
        )

    elif operation == "date_add":
        if len(operands) < 2:
            raise UtilityError("INVALID_OPERANDS", "date_add requires [start_date, amount, unit?]")

        start_date = parse_date(str(operands[0]))
        amount = int(operands[1])
        unit = str(operands[2]) if len(operands) > 2 else "days"

        # Check calendar type
        if request.calendar == "business_days":
            # Business days require holiday calendar
            raise UnsupportedCalendarError("business_days")

        normalized_inputs = [start_date.isoformat(), amount, unit]

        if unit in ("days", "day", "calendar_days"):
            result_date = add_days(start_date, amount)
            trace = f"date_add: {start_date} + {amount} days"
            assumptions.append("Calendar days (no holiday adjustment)")
        elif unit in ("months", "month"):
            result_date = add_months(start_date, amount)
            trace = f"date_add: {start_date} + {amount} months"
            assumptions.append("Month addition clamps to valid day")
        elif unit in ("years", "year"):
            result_date = add_years(start_date, amount)
            trace = f"date_add: {start_date} + {amount} years"
            assumptions.append("Year addition handles leap years")
        elif unit in ("weeks", "week"):
            result_date = add_days(start_date, amount * 7)
            trace = f"date_add: {start_date} + {amount} weeks"
        else:
            raise UtilityError("INVALID_UNIT", f"Unknown date unit: {unit}")

        return DeterministicUtilityOutput(
            result_type="date",
            result=result_date.isoformat(),
            normalized_inputs=normalized_inputs,
            assumptions=assumptions,
            timezone=request.timezone,
            calculation_trace=trace,
            utility_version=UTILITY_VERSION,
        )

    elif operation == "date_difference":
        if len(operands) != 2:
            raise UtilityError("INVALID_OPERANDS", "date_difference requires [start_date, end_date]")

        start_date = parse_date(str(operands[0]))
        end_date = parse_date(str(operands[1]))

        # Check calendar type
        if request.calendar == "business_days":
            raise UnsupportedCalendarError("business_days")

        days = date_difference_days(start_date, end_date)

        return DeterministicUtilityOutput(
            result_type="duration",
            result={"days": days, "unit": "calendar_days"},
            normalized_inputs=[start_date.isoformat(), end_date.isoformat()],
            assumptions=["Calendar days (no holiday adjustment)"],
            timezone=request.timezone,
            calculation_trace=f"date_difference: {end_date} - {start_date} = {days} days",
            utility_version=UTILITY_VERSION,
        )

    elif operation == "unit_convert":
        if len(operands) != 3:
            raise UtilityError("INVALID_OPERANDS", "unit_convert requires [value, from_unit, to_unit]")

        value = Decimal(str(operands[0]))
        from_unit = str(operands[1]).lower()
        to_unit = str(operands[2]).lower()

        key = (from_unit, to_unit)
        if key not in UNIT_CONVERSIONS:
            raise UtilityError(
                "UNSUPPORTED_CONVERSION",
                f"Conversion from {from_unit} to {to_unit} is not supported",
            )

        factor = UNIT_CONVERSIONS[key]
        if factor is None:
            raise UtilityError(
                "EXTERNAL_RATE_REQUIRED",
                f"Conversion from {from_unit} to {to_unit} requires external rate data",
            )

        result = value * factor
        if rounding_mode:
            result = result.quantize(Decimal(10) ** -precision, rounding=rounding_mode)

        return DeterministicUtilityOutput(
            result_type="unit_value",
            result={"value": str(result), "unit": to_unit},
            normalized_inputs=[str(value), from_unit, to_unit],
            assumptions=[f"Conversion factor: 1 {from_unit} = {factor} {to_unit}"],
            timezone=request.timezone,
            calculation_trace=f"unit_convert: {value} {from_unit} * {factor} = {result} {to_unit}",
            utility_version=UTILITY_VERSION,
        )

    else:
        raise UtilityError("UNKNOWN_OPERATION", f"Unknown operation: {operation}")