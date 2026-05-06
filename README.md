# Finance Chat

An AI-powered financial chat assistant built with Next.js 15 and GPT-4o. Ask questions about stocks, run calculations, and generate financial charts — all in one conversation.

Anonymous users get 5 free messages per 24 hours. Sign up to unlock unlimited access and persistent chat history.

---

## Requirements

- Node.js 20+
- An [OpenAI API key](https://platform.openai.com/api-keys)
- (Optional) An [Alpha Vantage API key](https://www.alphavantage.co/support/#api-key) for live market data

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Open `.env.local` and set the following:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | **Yes** | Your OpenAI API key (`sk-...`) |
| `AUTH_SECRET` | **Yes** | Random secret for JWT signing — generate with `openssl rand -base64 32` |
| `ALPHA_VANTAGE_API_KEY` | No | Live market data key. Defaults to `demo` (limited to a few tickers) |
| `OPENAI_MODEL` | No | Model to use. Defaults to `gpt-4o` |
| `ANON_MESSAGE_LIMIT` | No | Max messages for anonymous users per 24h. Defaults to `5` |

Minimum working `.env.local`:

```
OPENAI_API_KEY=sk-...
AUTH_SECRET=<output of: openssl rand -base64 32>
```

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Creating an account

Anonymous visitors can send up to 5 messages before being asked to sign up. Click **Sign up** in the banner or modal to create an account with email and password. Your conversation history carries over automatically after login.

To create an account via the API directly:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}'
```

---

## Available tools

The assistant has access to the following tools:

| Tool | Description |
|---|---|
| `calculate` | Evaluate arithmetic expressions |
| `get_stock_quote` | Latest price and change for a ticker |
| `get_stock_overview` | Company fundamentals (P/E, market cap, sector) |
| `get_income_statement` | Annual income statement data |
| `get_balance_sheet` | Annual balance sheet data |
| `get_cash_flow` | Annual cash flow data |
| `get_earnings` | Historical EPS and earnings dates |
| `search_symbol` | Look up a ticker by company name |
| `generate_financial_graph` | Render a chart from financial data |

---

## Other commands

```bash
npm test              # run unit tests
npm run test:watch    # run tests in watch mode
npm run build         # production build
npm start             # start production server (after build)
```

---

## Data storage

Chat history and user accounts are stored in a local SQLite database at `data/finance-chat.db` (created automatically on first run). To change the path, set `DB_PATH` in `.env.local`.
