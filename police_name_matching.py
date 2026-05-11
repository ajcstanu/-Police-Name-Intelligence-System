"""
Police Name Intelligence System — Python Port
==============================================
Transliteration + fuzzy name matching for Hindi-English police records.
Mirrors the algorithms and database from police_name_matching.jsx.

Usage:
    python police_name_matching.py
    python police_name_matching.py --query "Suresh" --threshold 0.45
    python police_name_matching.py --query "सुरेश कुमार" --threshold 0.4
    python police_name_matching.py --add-record
"""

import re
import argparse
import unicodedata
from dataclasses import dataclass, field
from typing import Optional


# ── Transliteration Map (Hindi Devanagari → English phonetic) ────────────────

HINDI_TO_ROMAN: dict[str, str] = {
    # Vowels (independent)
    "अ": "a",  "आ": "aa", "इ": "i",  "ई": "ee", "उ": "u",  "ऊ": "oo",
    "ए": "e",  "ऐ": "ai", "ओ": "o",  "औ": "au", "ऋ": "ri", "ऑ": "o",
    # Consonants
    "क": "k",  "ख": "kh", "ग": "g",  "घ": "gh", "ङ": "n",
    "च": "ch", "छ": "chh","ज": "j",  "झ": "jh", "ञ": "n",
    "ट": "t",  "ठ": "th", "ड": "d",  "ढ": "dh", "ण": "n",
    "त": "t",  "थ": "th", "द": "d",  "ध": "dh", "न": "n",
    "प": "p",  "फ": "ph", "ब": "b",  "भ": "bh", "म": "m",
    "य": "y",  "र": "r",  "ल": "l",  "व": "v",
    "श": "sh", "ष": "sh", "स": "s",  "ह": "h",
    # Special consonants
    "ड़": "r",  "ढ़": "rh", "फ़": "f",  "ज़": "z",  "ख़": "kh", "ग़": "gh",
    # Matras (vowel diacritics)
    "ा": "a",  "ि": "i",  "ी": "i",  "ु": "u",  "ू": "u",
    "े": "e",  "ै": "ai", "ो": "o",  "ौ": "au",
    # Diacritics / modifiers
    "ं": "n",  "ः": "h",  "्": "",   "ँ": "n",
    # Conjunct consonants
    "क्ष": "ksh", "त्र": "tr", "ज्ञ": "gya",
}


def transliterate_hindi_to_english(text: str) -> str:
    """Convert Devanagari script to Roman phonetic representation."""
    if not text:
        return ""
    result = []
    chars = list(text)
    i = 0
    while i < len(chars):
        two = chars[i] + (chars[i + 1] if i + 1 < len(chars) else "")
        if two in HINDI_TO_ROMAN:
            result.append(HINDI_TO_ROMAN[two])
            i += 2
        elif chars[i] in HINDI_TO_ROMAN:
            result.append(HINDI_TO_ROMAN[chars[i]])
            i += 1
        elif chars[i] == " ":
            result.append(" ")
            i += 1
        else:
            result.append(chars[i])
            i += 1
    return "".join(result).lower().strip()


def is_devanagari(text: str) -> bool:
    """Return True if the text contains Devanagari characters."""
    return any("\u0900" <= ch <= "\u097F" for ch in text)


# ── Core Algorithms ───────────────────────────────────────────────────────────

def soundex(name: str) -> str:
    """Standard Soundex phonetic code."""
    if not name:
        return ""
    s = re.sub(r"[^A-Za-z]", "", name).upper()
    if not s:
        return ""
    code_map = {
        "B": "1", "F": "1", "P": "1", "V": "1",
        "C": "2", "G": "2", "J": "2", "K": "2",
        "Q": "2", "S": "2", "X": "2", "Z": "2",
        "D": "3", "T": "3",
        "L": "4",
        "M": "5", "N": "5",
        "R": "6",
    }
    code = s[0]
    prev = code_map.get(s[0], "0")
    for ch in s[1:]:
        if len(code) == 4:
            break
        c = code_map.get(ch, "0")
        if c != "0" and c != prev:
            code += c
        prev = c
    return code.ljust(4, "0")


def metaphone(word: str) -> str:
    """Simplified Metaphone phonetic algorithm."""
    if not word:
        return ""
    w = re.sub(r"[^A-Za-z]", "", word).upper()

    # Initial transformations
    w = re.sub(r"^(AE|GN|KN|PN|WR)", lambda m: m.group()[1], w)
    w = re.sub(r"MB$", "M", w)

    substitutions = [
        (r"CIA|SCH", "X"), (r"CH", "X"),
        (r"CI|CE|CY", "S"), (r"C", "K"),
        (r"DGE|DGI|DGY", "J"), (r"DG", "TK"), (r"D", "T"),
        (r"GH(?=[AEIOU])", "K"), (r"GN(ED)?$", ""),
        (r"G", "K"), (r"PH", "F"), (r"QU", "K"),
        (r"S[CK]", "SK"), (r"SH", "X"), (r"TH", "0"),
        (r"TCH", "X"), (r"WH(?=[AEIOU])", "W"),
        (r"[AEIOU]+", ""), (r"[HWY]", ""),
    ]
    for pattern, replacement in substitutions:
        w = re.sub(pattern, replacement, w)

    # Deduplicate consecutive identical chars
    result = []
    for ch in w:
        if not result or ch != result[-1]:
            result.append(ch)
    return "".join(result)


def levenshtein(a: str, b: str) -> int:
    """Compute the Levenshtein edit distance between two strings."""
    a, b = a.lower(), b.lower()
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]


def jaro_winkler(s1: str, s2: str) -> float:
    """Compute the Jaro-Winkler similarity (0.0–1.0)."""
    s1, s2 = s1.lower(), s2.lower()
    if s1 == s2:
        return 1.0
    l1, l2 = len(s1), len(s2)
    if l1 == 0 or l2 == 0:
        return 0.0

    match_dist = max(max(l1, l2) // 2 - 1, 0)
    m1 = [False] * l1
    m2 = [False] * l2
    matches = 0
    transpositions = 0

    for i in range(l1):
        start = max(0, i - match_dist)
        end = min(i + match_dist + 1, l2)
        for j in range(start, end):
            if not m2[j] and s1[i] == s2[j]:
                m1[i] = m2[j] = True
                matches += 1
                break

    if matches == 0:
        return 0.0

    s1_matches = [s1[i] for i in range(l1) if m1[i]]
    s2_matches = [s2[j] for j in range(l2) if m2[j]]
    for c1, c2 in zip(s1_matches, s2_matches):
        if c1 != c2:
            transpositions += 1

    jaro = (
        matches / l1
        + matches / l2
        + (matches - transpositions / 2) / matches
    ) / 3

    # Winkler prefix bonus (up to 4 chars)
    prefix = 0
    for i in range(min(4, l1, l2)):
        if s1[i] == s2[i]:
            prefix += 1
        else:
            break

    return jaro + prefix * 0.1 * (1 - jaro)


def ngram_similarity(a: str, b: str, n: int = 2) -> float:
    """Jaccard similarity over character n-grams."""
    def ngrams(s: str) -> set:
        return {s[i: i + n] for i in range(max(0, len(s) - n + 1))}

    ga, gb = ngrams(a.lower()), ngrams(b.lower())
    if not ga and not gb:
        return 0.0
    intersection = ga & gb
    union = ga | gb
    return len(intersection) / len(union) if union else 0.0


def normalize_hindi_name(name: str) -> str:
    """
    Collapse common Hindi transliteration variants into a canonical form.
    E.g. 'Kumaar' and 'Kumar' → same key.
    """
    if not name:
        return ""
    n = name.lower().strip()
    n = n.replace("aa", "a").replace("ee", "i").replace("oo", "u")
    n = n.replace("ph", "f").replace("bh", "b").replace("gh", "g")
    n = n.replace("kh", "k").replace("th", "t").replace("dh", "d")
    n = n.replace("sh", "s").replace("ch", "c").replace("jh", "j")
    # Collapse consecutive identical chars (schwa duplication)
    n = re.sub(r"(.)\1+", r"\1", n)
    # Collapse consecutive vowels to the first
    n = re.sub(r"[aeiou]+", lambda m: m.group()[0], n)
    return n


def compute_similarity(query: str, candidate: str) -> float:
    """
    Weighted combination of six similarity metrics.
    Returns a score in [0, 1].
    """
    q = query.lower().strip()
    c = candidate.lower().strip()
    if not q or not c:
        return 0.0
    if q == c:
        return 1.0

    max_len = max(len(q), len(c))

    lev_score   = (max_len - levenshtein(q, c)) / max_len
    jw_score    = jaro_winkler(q, c)
    ng_score    = ngram_similarity(q, c, n=2)
    sd_score    = 1.0 if soundex(q) == soundex(c) else 0.3
    mp_score    = 1.0 if metaphone(q) == metaphone(c) else 0.3

    nq, nc      = normalize_hindi_name(q), normalize_hindi_name(c)
    norm_len    = max(len(nq), len(nc))
    norm_score  = 1.0 if nq == nc else (norm_len - levenshtein(nq, nc)) / norm_len if norm_len else 0.0

    return (
        0.20 * lev_score
        + 0.25 * jw_score
        + 0.15 * ng_score
        + 0.15 * sd_score
        + 0.10 * mp_score
        + 0.15 * norm_score
    )


# ── Data Model ────────────────────────────────────────────────────────────────

@dataclass
class Record:
    id: str
    name: str
    hindi: str
    role: str
    case: str
    dob: str = ""
    address: str = ""


@dataclass
class MatchResult:
    record: Record
    score: float
    levenshtein_pct: int
    jaro_winkler_pct: int
    ngram_pct: int
    soundex_match: bool
    metaphone_match: bool


# ── Mock Database ─────────────────────────────────────────────────────────────

INITIAL_RECORDS: list[Record] = [
    Record("R001", "Suresh Kumar",   "सुरेश कुमार",    "Suspect",  "CR-2024-001", "1985-03-12", "12 MG Road, Delhi"),
    Record("R002", "Rajesh Singh",   "राजेश सिंह",     "Witness",  "CR-2024-002", "1978-07-22", "45 Lajpat Nagar, Delhi"),
    Record("R003", "Priya Sharma",   "प्रिया शर्मा",   "Victim",   "CR-2024-003", "1992-11-05", "7 Connaught Place, Delhi"),
    Record("R004", "Amit Verma",     "अमित वर्मा",     "Reporter", "CR-2024-004", "1990-01-18", "23 Karol Bagh, Delhi"),
    Record("R005", "Sunita Devi",    "सुनीता देवी",    "Witness",  "CR-2024-001", "1968-09-30", "56 Rohini, Delhi"),
    Record("R006", "Mohit Agarwal",  "मोहित अग्रवाल",  "Suspect",  "CR-2024-005", "1988-04-14", "34 Vasant Kunj, Delhi"),
    Record("R007", "Kavita Joshi",   "कविता जोशी",     "Reporter", "CR-2024-006", "1975-12-01", "89 Dwarka, Delhi"),
    Record("R008", "Deepak Pandey",  "दीपक पाण्डे",    "Suspect",  "CR-2024-007", "1983-06-25", "11 Saket, Delhi"),
    Record("R009", "Anita Gupta",    "अनीता गुप्ता",   "Victim",   "CR-2024-008", "1995-02-17", "67 Janakpuri, Delhi"),
    Record("R010", "Vikram Yadav",   "विक्रम यादव",    "Reporter", "CR-2024-009", "1980-08-08", "4 Pitampura, Delhi"),
    Record("R011", "Sursh Kumar",    "सुरेश कुमार",    "Suspect",  "CR-2024-010", "1985-03-12", "12 MG Road, Delhi"),
    Record("R012", "Rajeesh Singh",  "राजेश सिंह",     "Witness",  "CR-2024-011", "1978-07-22", "45 Lajpat Nagar, Delhi"),
    Record("R013", "Kumaar Sharma",  "कुमार शर्मा",    "Suspect",  "CR-2024-012", "1970-05-20", "33 Paharganj, Delhi"),
    Record("R014", "Suresha Kumari", "सुरेशा कुमारी",  "Victim",   "CR-2024-013", "1993-09-10", "18 Tilak Nagar, Delhi"),
    Record("R015", "Mohd Rizwan",    "मोहम्मद रिजवान", "Reporter", "CR-2024-014", "1987-03-28", "55 Okhla, Delhi"),
    Record("R016", "Shyam Lal",      "श्याम लाल",      "Witness",  "CR-2024-015", "1965-11-15", "72 Laxmi Nagar, Delhi"),
    Record("R017", "Geeta Rawat",    "गीता रावत",      "Victim",   "CR-2024-016", "1991-07-04", "9 Uttam Nagar, Delhi"),
    Record("R018", "Harish Chandra", "हरीश चन्द्र",    "Suspect",  "CR-2024-017", "1977-02-11", "62 Shahdara, Delhi"),
]


# ── Database Class ────────────────────────────────────────────────────────────

class PoliceDatabase:
    def __init__(self, records: list[Record] | None = None):
        self._records: list[Record] = list(records or INITIAL_RECORDS)

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def add_record(
        self,
        name: str,
        case_id: str,
        hindi: str = "",
        role: str = "Reporter",
        dob: str = "",
        address: str = "",
    ) -> Record:
        if not name or not case_id:
            raise ValueError("Name and Case ID are required.")
        new_id = f"R{len(self._records) + 1:03d}"
        record = Record(
            id=new_id,
            name=name,
            hindi=hindi,
            role=role,
            case=case_id,
            dob=dob,
            address=address,
        )
        self._records.append(record)
        return record

    def all_records(self) -> list[Record]:
        return list(self._records)

    def stats(self) -> dict[str, int]:
        roles = [r.role for r in self._records]
        return {
            "total":     len(self._records),
            "suspects":  roles.count("Suspect"),
            "witnesses": roles.count("Witness"),
            "victims":   roles.count("Victim"),
            "reporters": roles.count("Reporter"),
        }

    # ── Search ────────────────────────────────────────────────────────────────

    def search(
        self,
        query: str,
        threshold: float = 0.45,
        role_filter: str = "All",
    ) -> list[MatchResult]:
        """
        Search the database for names matching the query.

        Args:
            query:       Name to search (English or Devanagari).
            threshold:   Minimum similarity score (0.0–1.0). Default 0.45.
            role_filter: Filter results by role ('All', 'Suspect', etc.).

        Returns:
            List of MatchResult sorted by score descending.
        """
        if is_devanagari(query):
            effective_query = transliterate_hindi_to_english(query)
        else:
            effective_query = query.strip()

        if not effective_query:
            return []

        results: list[MatchResult] = []

        for record in self._records:
            if role_filter != "All" and record.role != role_filter:
                continue

            name_score  = compute_similarity(effective_query, record.name)
            hindi_translit = transliterate_hindi_to_english(record.hindi)
            hindi_score = compute_similarity(effective_query, hindi_translit)
            score = max(name_score, hindi_score)

            if score < threshold:
                continue

            max_len = max(len(effective_query), len(record.name)) or 1
            results.append(
                MatchResult(
                    record=record,
                    score=score,
                    levenshtein_pct=round(
                        (1 - levenshtein(effective_query.lower(), record.name.lower()) / max_len) * 100
                    ),
                    jaro_winkler_pct=round(jaro_winkler(effective_query, record.name) * 100),
                    ngram_pct=round(ngram_similarity(effective_query, record.name) * 100),
                    soundex_match=soundex(effective_query) == soundex(record.name),
                    metaphone_match=metaphone(effective_query) == metaphone(record.name),
                )
            )

        results.sort(key=lambda r: r.score, reverse=True)
        return results


# ── CLI Display Helpers ───────────────────────────────────────────────────────

ROLE_COLORS = {
    "Suspect":  "\033[91m",   # red
    "Witness":  "\033[94m",   # blue
    "Victim":   "\033[93m",   # yellow
    "Reporter": "\033[92m",   # green
}
RESET   = "\033[0m"
BOLD    = "\033[1m"
DIM     = "\033[2m"
CYAN    = "\033[96m"
GREEN   = "\033[92m"
YELLOW  = "\033[93m"
RED     = "\033[91m"


def score_color(score: float) -> str:
    if score >= 0.80:
        return GREEN
    if score >= 0.60:
        return CYAN
    return RED


def print_header():
    print(f"\n{BOLD}{'=' * 66}{RESET}")
    print(f"{BOLD}  🔏  POLICE NAME INTELLIGENCE SYSTEM{RESET}")
    print(f"{DIM}  Advanced Fuzzy Matching · Hindi-English Interoperability{RESET}")
    print(f"{BOLD}{'=' * 66}{RESET}\n")


def print_result(match: MatchResult, rank: int):
    r = match.record
    sc = score_color(match.score)
    role_c = ROLE_COLORS.get(r.role, "")
    pct = round(match.score * 100)

    print(f"  {BOLD}#{rank}  {sc}{pct:>3}% MATCH{RESET}  {BOLD}{r.name}{RESET}", end="")
    if r.hindi:
        print(f"  {DIM}{r.hindi}{RESET}", end="")
    print(f"  [{role_c}{r.role}{RESET}]")

    print(f"       {DIM}ID:{RESET} {r.id}  {DIM}Case:{RESET} {r.case}", end="")
    if r.dob:
        print(f"  {DIM}DOB:{RESET} {r.dob}", end="")
    if r.address:
        print(f"  {DIM}Addr:{RESET} {r.address}", end="")
    print()

    tags = [
        f"LV:{match.levenshtein_pct}%",
        f"JW:{match.jaro_winkler_pct}%",
        f"NG:{match.ngram_pct}%",
    ]
    if match.soundex_match:
        tags.append(f"{GREEN}SOUNDEX✓{RESET}")
    if match.metaphone_match:
        tags.append(f"{CYAN}PHONETIC✓{RESET}")
    print(f"       {DIM}" + "  ".join(tags) + f"{RESET}")
    print()


def print_stats(db: PoliceDatabase):
    s = db.stats()
    print(f"  {DIM}Records: {BOLD}{s['total']}{RESET}  "
          f"{RED}Suspects:{s['suspects']}{RESET}  "
          f"{CYAN}Witnesses:{s['witnesses']}{RESET}  "
          f"{YELLOW}Victims:{s['victims']}{RESET}  "
          f"{GREEN}Reporters:{s['reporters']}{RESET}\n")


def interactive_search(db: PoliceDatabase):
    """Run an interactive CLI search loop."""
    print_header()
    print_stats(db)

    while True:
        print(f"{BOLD}Enter name to search{RESET} (English or हिंदी), or 'add', 'list', 'quit':")
        raw = input("  > ").strip()

        if raw.lower() in ("quit", "exit", "q"):
            print(f"\n{DIM}Session ended.{RESET}\n")
            break

        if raw.lower() == "list":
            for i, rec in enumerate(db.all_records(), 1):
                role_c = ROLE_COLORS.get(rec.role, "")
                print(f"  {DIM}{rec.id}{RESET}  {rec.name}  {DIM}{rec.hindi or '—'}{RESET}  "
                      f"[{role_c}{rec.role}{RESET}]  {rec.case}")
            print()
            continue

        if raw.lower() == "add":
            print("  Name (English)*: ", end=""); name = input().strip()
            print("  Hindi name (optional): ", end=""); hindi = input().strip()
            print("  Case ID*: ", end=""); case_id = input().strip()
            print("  Role [Suspect/Witness/Victim/Reporter]: ", end=""); role = input().strip() or "Reporter"
            print("  DOB (YYYY-MM-DD): ", end=""); dob = input().strip()
            print("  Address: ", end=""); address = input().strip()
            try:
                rec = db.add_record(name, case_id, hindi, role, dob, address)
                print(f"\n  {GREEN}✓ Record added: {rec.id} — {rec.name}{RESET}\n")
            except ValueError as e:
                print(f"\n  {RED}✗ Error: {e}{RESET}\n")
            continue

        if not raw:
            continue

        try:
            threshold_input = input(f"  Threshold [{DIM}0.45{RESET}]: ").strip()
            threshold = float(threshold_input) if threshold_input else 0.45
        except ValueError:
            threshold = 0.45

        role_input = input(f"  Role filter [{DIM}All/Suspect/Witness/Victim/Reporter{RESET}]: ").strip()
        role_filter = role_input if role_input in ("All", "Suspect", "Witness", "Victim", "Reporter") else "All"

        # Show transliteration if Devanagari
        if is_devanagari(raw):
            translit = transliterate_hindi_to_english(raw)
            print(f"\n  {DIM}Transliterated:{RESET} {CYAN}{translit}{RESET}")

        matches = db.search(raw, threshold=threshold, role_filter=role_filter)
        print(f"\n  {BOLD}{len(matches)} match{'es' if len(matches) != 1 else ''}{RESET} "
              f"found above {round(threshold * 100)}% threshold\n")

        if matches:
            for i, m in enumerate(matches, 1):
                print_result(m, i)
        else:
            print(f"  {DIM}No records matched. Try lowering the threshold or checking spelling.{RESET}\n")


# ── Programmatic API Examples ─────────────────────────────────────────────────

def demo():
    """Run a few example searches to demonstrate the API."""
    db = PoliceDatabase()
    print_header()

    examples = [
        ("Sursh Kumaar",    0.40, "All"),       # Typo: should match Suresh Kumar
        ("Rajeesh",         0.40, "Witness"),    # Elongated vowel
        ("सुरेश कुमार",    0.45, "All"),        # Hindi input
        ("Priyaa Sharma",   0.45, "Victim"),     # Double vowel
        ("Vikrum Yadav",    0.45, "All"),        # Vowel substitution
    ]

    for query, threshold, role in examples:
        print(f"{BOLD}Query:{RESET} {CYAN}{query}{RESET}  "
              f"{DIM}threshold={round(threshold*100)}%  role={role}{RESET}")
        if is_devanagari(query):
            print(f"  {DIM}→ Transliterated: {transliterate_hindi_to_english(query)}{RESET}")

        results = db.search(query, threshold=threshold, role_filter=role)
        print(f"  {len(results)} result(s)\n")
        for i, m in enumerate(results, 1):
            print_result(m, i)
        print("-" * 66 + "\n")


# ── Entry Point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Police Name Intelligence System — fuzzy Hindi-English name matching"
    )
    parser.add_argument("--query",     help="Name to search (English or Devanagari)")
    parser.add_argument("--threshold", type=float, default=0.45, help="Similarity threshold (default 0.45)")
    parser.add_argument("--role",      default="All", help="Role filter: All/Suspect/Witness/Victim/Reporter")
    parser.add_argument("--demo",      action="store_true", help="Run built-in demo examples")
    parser.add_argument("--interactive", action="store_true", help="Start interactive search loop")
    args = parser.parse_args()

    db = PoliceDatabase()

    if args.demo:
        demo()
    elif args.query:
        print_header()
        if is_devanagari(args.query):
            print(f"  Transliterated: {CYAN}{transliterate_hindi_to_english(args.query)}{RESET}\n")
        results = db.search(args.query, threshold=args.threshold, role_filter=args.role)
        print(f"  {BOLD}{len(results)} match(es){RESET} for '{args.query}' "
              f"above {round(args.threshold * 100)}% threshold\n")
        for i, m in enumerate(results, 1):
            print_result(m, i)
    else:
        interactive_search(db)


if __name__ == "__main__":
    main()
