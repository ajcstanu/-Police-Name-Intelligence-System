#  Police Name Intelligence System

A React-based forensic name matching tool designed for Indian law enforcement, enabling accurate identification of individuals across **Hindi (Devanagari)** and **English** scripts using multiple fuzzy matching algorithms and AI-powered analysis.

---

## 📌 Overview

Police records in India often contain names spelled inconsistently due to transliteration differences, regional dialects, or data entry errors (e.g., *"Suresh"* vs *"Sursh"* vs *"Suresha"*). This system addresses that challenge by combining phonetic, edit-distance, and n-gram algorithms with real-time Hindi-to-English transliteration, enabling reliable name lookups across script variations.

---

##  Features

- **Multi-Algorithm Fuzzy Matching** — Combines five algorithms for robust name similarity scoring
- **Hindi ↔ English Transliteration** — Automatically converts Devanagari input to Roman phonetic form for cross-script search
- **AI Match Analysis** — Powered by Claude (Anthropic API) to explain why a name matched and recommend officer actions
- **Configurable Threshold** — Adjustable similarity threshold (default 45%) for broad investigation vs. precise verification
- **Role-Based Filtering** — Filter results by Suspect, Witness, Victim, or Reporter
- **Live Database Management** — Add new records with Hindi name, role, case ID, DOB, and address
- **Analytics Dashboard** — Visual comparison of algorithm performance and common Hindi name variation patterns
- **Operator Guidelines** — Built-in transliteration standards and search best practices for officers

---

##  Matching Algorithms

| Algorithm | Weight | Purpose |
|---|---|---|
| **Jaro-Winkler** | 25% | Best for names with prefix variations (e.g., *Raj* vs *Rajesh*) |
| **Levenshtein Distance** | 20% | Handles typos and character-level edits |
| **Hindi Normalization** | 15% | Collapses phonetic equivalents (e.g., *aa→a*, *sh→s*) |
| **N-gram (Bigram)** | 15% | Substring similarity, effective for transliteration noise |
| **Soundex** | 15% | Groups phonetically similar names |
| **Metaphone** | 10% | Deep phonetic similarity for Indian consonant clusters |

The final score is a **weighted combination** of all six metrics. Scores ≥ threshold are returned as matches.

---

##  Hindi Transliteration

The system includes a custom Devanagari → Roman phonetic map covering:

- All Hindi vowels and consonants
- Aspirated consonants (`ख=kh`, `घ=gh`, `छ=chh`, `झ=jh`, `ठ=th`, `ढ=dh`, `फ=ph`, `भ=bh`)
- Special characters (`ड़=r`, `ज़=z`, `फ़=f`)
- Matras (vowel diacritics) and anusvara (`ं=n`)
- Conjunct consonants (`क्ष=ksh`, `त्र=tr`, `ज्ञ=gya`)

Queries typed in Devanagari are automatically transliterated before matching against the database.

---

##  UI Tabs

### 🔍 Search
- Enter a name in English or Hindi script
- Adjust the similarity threshold slider
- Filter by role (Suspect / Witness / Victim / Reporter)
- View match scores with per-algorithm breakdown
- Click **AI Analysis** on any result for a Claude-powered explanation

###  Database
- Browse all records in a tabular view
- Add new records with full metadata (name, Hindi name, case ID, role, DOB, address)

###  Analytics
- Algorithm performance comparison (bar chart)
- Common Hindi name variation examples
- Transliteration reference examples

###  Guidelines
- Data entry standards for bilingual records
- Search best practices for investigators
- Common transliteration mistakes to avoid
- Script interoperability instructions

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 16
- A React environment (Create React App, Vite, or similar)
- An [Anthropic API key](https://console.anthropic.com/) for AI analysis

### Installation

```bash
git clone https://github.com/your-username/police-name-intelligence-system.git
cd police-name-intelligence-system
npm install
```

### API Key Setup

The AI Analysis feature calls the Anthropic API. Set up your key in your environment or proxy — the component uses:

```
https://api.anthropic.com/v1/messages
```

> **Note:** Do not expose your API key in a client-side build for production. Route requests through a backend proxy.

### Run

```bash
npm start
```

---

## 📁 File Structure

```
police_name_matching.jsx   # Main self-contained React component
README.md
```

The entire application is a **single-file React component** with no external UI dependencies.

---

##  Data & Privacy

- The mock database (`RECORDS`) contains fictional test data for Delhi-based cases.
- No data is persisted between sessions; all records are stored in React state.
- AI analysis requests send only the name, match score, and match metadata — no PII beyond what the officer inputs.
- For production deployment, replace the in-memory database with a secure backend and authenticated API calls.

---

## 🛠️ Customization

| What to change | Where |
|---|---|
| Similarity threshold default | `useState(0.45)` → change `0.45` |
| Algorithm weights | `computeSimilarity()` → final weighted return line |
| Transliteration map | `HINDI_TO_ROMAN` constant |
| Initial database records | `RECORDS` array |
| AI system prompt / instructions | `getAiAnalysis()` → `system` field |
| Role types | `ROLE_COLORS`, `ROLE_BG`, and the select dropdown |

---

## 📦 Dependencies

| Package | Use |
|---|---|
| `react` | UI framework |
| `react` hooks (`useState`, `useCallback`, `useRef`) | State and interaction |
| Anthropic API (`claude-sonnet-4-20250514`) | AI match analysis |

No third-party UI libraries required.


---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change. Ensure all algorithm changes are tested against the included name variation examples.

---

*Built for Indian law enforcement use cases. Handles Devanagari script, aspirated consonants, schwa deletion, and common Hindi name spelling variations.*

-----
Here is two backend file 1st in python and 2nd in jsx.
