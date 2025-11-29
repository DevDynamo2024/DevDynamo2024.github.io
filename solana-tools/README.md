# Solana Transaction Generator

A pure JavaScript web application for generating and decoding Solana transactions without dependencies on external libraries.

🌐 **Live Demo**: https://DevDynamo2024.github.io/tools/solana-tools/

## Features

- 💰 **SOL Transfer** - Generate native SOL transfer transactions
- 🪙 **SPL Token Transfer** - Generate SPL token transfer transactions
- 🔍 **Transaction Decoder** - Decode Base58 encoded Solana transactions
- 🌐 **Multi-Network Support** - Mainnet, Devnet, Testnet, and custom RPC endpoints
- ⚡ **No External Dependencies** - Pure JavaScript Base58 encoding/decoding

## Development

```bash
# Install dependencies
npm install

# Run development server (http://localhost:5173)
npm run dev

# Build for production
npm run build
```

## Deployment

This project is deployed to GitHub Pages from the main repository. After making changes:

### 1. Build the project
```bash
npm run build
```

### 2. Copy build artifacts to root
```bash
# Build artifacts are automatically copied to root directory
# (index.html and assets/ folder)
cp -r dist/assets .
cp dist/index.html .
```

### 3. Commit and push
```bash
# From the repository root (tools/)
git add solana-tools/
git commit -m "Update Solana Transaction Generator"
git push origin main
```

The site will be automatically available at:
**https://DevDynamo2024.github.io/tools/solana-tools/**

## Project Structure

```
solana-tools/
├── src/
│   ├── App.jsx          # Main React component
│   └── main.jsx         # React entry point
├── assets/              # 📦 Built JavaScript bundles (committed to git)
├── dist/                # Build output (gitignored)
├── index.html           # 📦 Built HTML (committed to git)
├── package.json         # Dependencies and scripts
├── vite.config.js       # Vite build configuration
└── README.md            # This file
```

**Note**: The `assets/` folder and root `index.html` are build artifacts that are committed to git for GitHub Pages deployment. Source files remain in `src/` directory.

## How It Works

### Base58 Encoding
- Custom pure JavaScript implementation
- No dependency on bs58 or other libraries
- Supports both encoding and decoding

### Transaction Building
- Implements Solana's compact-u16 encoding
- Proper account ordering (signers first, writables before read-only)
- Supports both SOL and SPL Token transfers

### Decoder
- Parses transaction binary format
- Extracts all account addresses
- Displays instruction data in hex format

## Technologies

- **React 18** - UI framework
- **Vite 5** - Build tool and dev server
- **Tailwind CSS** - Styling (CDN)
- **Pure JavaScript** - No Solana SDK dependencies

## Common Tasks

### Update after code changes
```bash
npm run build
cp -r dist/assets . && cp dist/index.html .
git add . && git commit -m "Update app" && git push
```

### Test locally
```bash
npm run dev
# Visit http://localhost:5173
```

### Preview production build
```bash
npm run build
npm run preview
```

## License

ISC
