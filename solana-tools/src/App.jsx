import React, { useState, useCallback } from 'react';

// Base58 alphabet used by Bitcoin/Solana
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Pure JavaScript Base58 encoder
function encodeBase58(bytes) {
  if (bytes.length === 0) return '';
  
  let zeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    zeros++;
  }
  
  let num = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    num = num * BigInt(256) + BigInt(bytes[i]);
  }
  
  let result = '';
  while (num > 0) {
    const remainder = Number(num % BigInt(58));
    num = num / BigInt(58);
    result = BASE58_ALPHABET[remainder] + result;
  }
  
  return '1'.repeat(zeros) + result;
}

// Decode Base58 to bytes
function decodeBase58(str) {
  if (str.length === 0) return new Uint8Array(0);
  
  let zeros = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    zeros++;
  }
  
  let num = BigInt(0);
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base58 character: ${char}`);
    }
    num = num * BigInt(58) + BigInt(index);
  }
  
  const bytes = [];
  while (num > 0) {
    bytes.unshift(Number(num % BigInt(256)));
    num = num / BigInt(256);
  }
  
  const result = new Uint8Array(zeros + bytes.length);
  result.set(bytes, zeros);
  return result;
}

// Helper to convert bytes to hex string
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Write compact-u16 (Solana's variable length encoding)
function encodeCompactU16(value) {
  const bytes = [];
  let val = value;
  while (val >= 0x80) {
    bytes.push((val & 0x7f) | 0x80);
    val >>= 7;
  }
  bytes.push(val);
  return new Uint8Array(bytes);
}

// Write u32 little-endian
function writeU32LE(value) {
  const bytes = new Uint8Array(4);
  bytes[0] = value & 0xff;
  bytes[1] = (value >> 8) & 0xff;
  bytes[2] = (value >> 16) & 0xff;
  bytes[3] = (value >> 24) & 0xff;
  return bytes;
}

// Write u64 little-endian
function writeU64LE(value) {
  const bytes = new Uint8Array(8);
  const bigValue = BigInt(value);
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number((bigValue >> BigInt(i * 8)) & BigInt(0xff));
  }
  return bytes;
}

// Write u8
function writeU8(value) {
  return new Uint8Array([value & 0xff]);
}

// Common program IDs
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

// RPC endpoints (public endpoints that support browser CORS)
const RPC_ENDPOINTS = {
  'Helius (Free)': 'https://mainnet.helius-rpc.com/?api-key=1d8740dc-e5f4-421c-b823-e1bad1889eff',
  'Mainnet (Official)': 'https://api.mainnet-beta.solana.com',
  'Devnet': 'https://api.devnet.solana.com',
  'Testnet': 'https://api.testnet.solana.com',
};

// Validate Base58 pubkey
const isValidPubkey = (pubkey) => {
  if (!pubkey || pubkey.trim() === '') return false;
  try {
    const decoded = decodeBase58(pubkey.trim());
    return decoded.length === 32;
  } catch {
    return false;
  }
};

export default function SolanaTransactionGenerator() {
  const [activeTab, setActiveTab] = useState('sol-transfer');
  const [rpcEndpoint, setRpcEndpoint] = useState('Helius (Free)');
  const [customRpc, setCustomRpc] = useState('');
  const [recentBlockhash, setRecentBlockhash] = useState('');
  const [isLoadingBlockhash, setIsLoadingBlockhash] = useState(false);
  const [generatedTx, setGeneratedTx] = useState('');
  const [error, setError] = useState('');
  const [txDetails, setTxDetails] = useState(null);

  // SOL Transfer state
  const [solFrom, setSolFrom] = useState('');
  const [solTo, setSolTo] = useState('');
  const [solAmount, setSolAmount] = useState('0.01');

  // Token Transfer state
  const [tokenFrom, setTokenFrom] = useState('');
  const [tokenTo, setTokenTo] = useState('');
  const [tokenMint, setTokenMint] = useState('');
  const [tokenAmount, setTokenAmount] = useState('1');
  const [tokenDecimals, setTokenDecimals] = useState('9');
  const [fromAta, setFromAta] = useState('');
  const [toAta, setToAta] = useState('');

  // Decoder state
  const [decodeInput, setDecodeInput] = useState('');
  const [decodedResult, setDecodedResult] = useState('');

  // Get current RPC URL
  const getRpcUrl = () => {
    if (rpcEndpoint === 'Custom') {
      return customRpc;
    }
    return RPC_ENDPOINTS[rpcEndpoint];
  };

  // Fetch recent blockhash from RPC
  const fetchBlockhash = async () => {
    setIsLoadingBlockhash(true);
    setError('');
    
    try {
      const rpcUrl = getRpcUrl();
      if (!rpcUrl) {
        throw new Error('Please enter a valid RPC URL');
      }

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getLatestBlockhash',
          params: [{ commitment: 'finalized' }]
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message || 'RPC error');
      }

      const blockhash = data.result?.value?.blockhash;
      if (!blockhash) {
        throw new Error('Failed to get blockhash from response');
      }

      setRecentBlockhash(blockhash);
    } catch (e) {
      setError(`Failed to fetch blockhash: ${e.message}`);
    } finally {
      setIsLoadingBlockhash(false);
    }
  };

  // Fetch token account info (to get ATA)
  const fetchTokenAccounts = async (wallet, mint) => {
    try {
      const rpcUrl = getRpcUrl();
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            wallet,
            { mint },
            { encoding: 'jsonParsed' }
          ]
        })
      });

      const data = await response.json();
      if (data.result?.value?.length > 0) {
        return data.result.value[0].pubkey;
      }
      return null;
    } catch {
      return null;
    }
  };

  // Auto-fetch ATAs
  const autoFetchAtas = async () => {
    if (!isValidPubkey(tokenFrom) || !isValidPubkey(tokenMint)) {
      setError('请先输入有效的发送方钱包地址和 Token Mint 地址');
      return;
    }

    setError('');
    try {
      const fromAtaResult = await fetchTokenAccounts(tokenFrom, tokenMint);
      if (fromAtaResult) {
        setFromAta(fromAtaResult);
      } else {
        setError('找不到发送方的 Token Account');
        return;
      }

      if (isValidPubkey(tokenTo)) {
        const toAtaResult = await fetchTokenAccounts(tokenTo, tokenMint);
        if (toAtaResult) {
          setToAta(toAtaResult);
        } else {
          setError('找不到接收方的 Token Account，请确认接收方已创建该代币账户');
        }
      }
    } catch (e) {
      setError(`获取 ATA 失败: ${e.message}`);
    }
  };

  // Core transaction builder
  const buildTransaction = useCallback((accounts, instructionData, programIdIndex, instructionAccountIndices) => {
    // Sort accounts for proper ordering
    const sortedAccounts = [...accounts].sort((a, b) => {
      if (a.isSigner !== b.isSigner) return a.isSigner ? -1 : 1;
      if (a.isWritable !== b.isWritable) return a.isWritable ? -1 : 1;
      return 0;
    });

    // Create index mapping
    const indexMap = accounts.map(acc => 
      sortedAccounts.findIndex(sa => sa.pubkey === acc.pubkey)
    );

    const numRequiredSignatures = sortedAccounts.filter(a => a.isSigner).length;
    const numReadonlySignedAccounts = sortedAccounts.filter(a => a.isSigner && !a.isWritable).length;
    const numReadonlyUnsignedAccounts = sortedAccounts.filter(a => !a.isSigner && !a.isWritable).length;

    // Remap instruction account indices
    const remappedInstructionAccounts = instructionAccountIndices.map(i => indexMap[i]);
    const remappedProgramIdIndex = indexMap[programIdIndex];

    // Build message
    const messageParts = [];

    // Header
    messageParts.push(new Uint8Array([
      numRequiredSignatures,
      numReadonlySignedAccounts,
      numReadonlyUnsignedAccounts
    ]));

    // Account count
    messageParts.push(encodeCompactU16(sortedAccounts.length));

    // Account addresses
    for (const acc of sortedAccounts) {
      messageParts.push(decodeBase58(acc.pubkey));
    }

    // Blockhash
    messageParts.push(decodeBase58(recentBlockhash));

    // Instructions count
    messageParts.push(encodeCompactU16(1));

    // Instruction
    messageParts.push(new Uint8Array([remappedProgramIdIndex]));
    messageParts.push(encodeCompactU16(remappedInstructionAccounts.length));
    messageParts.push(new Uint8Array(remappedInstructionAccounts));
    messageParts.push(encodeCompactU16(instructionData.length));
    messageParts.push(instructionData);

    // Combine message
    const totalLength = messageParts.reduce((sum, p) => sum + p.length, 0);
    const message = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of messageParts) {
      message.set(part, offset);
      offset += part.length;
    }

    // Build transaction (unsigned)
    const sigCount = encodeCompactU16(numRequiredSignatures);
    const emptySignatures = new Uint8Array(numRequiredSignatures * 64);
    
    const transaction = new Uint8Array(sigCount.length + emptySignatures.length + message.length);
    transaction.set(sigCount, 0);
    transaction.set(emptySignatures, sigCount.length);
    transaction.set(message, sigCount.length + emptySignatures.length);

    const base58Tx = encodeBase58(transaction);
    setGeneratedTx(base58Tx);

    return { message, transaction, base58: base58Tx };
  }, [recentBlockhash]);

  // Build SOL Transfer transaction
  const buildSolTransfer = useCallback(() => {
    setError('');
    setGeneratedTx('');
    setTxDetails(null);

    try {
      if (!recentBlockhash) throw new Error('请先获取 Recent Blockhash');
      if (!isValidPubkey(solFrom)) throw new Error('发送方地址无效');
      if (!isValidPubkey(solTo)) throw new Error('接收方地址无效');
      
      const lamports = Math.floor(parseFloat(solAmount) * 1e9);
      if (isNaN(lamports) || lamports <= 0) throw new Error('金额无效');

      // Accounts: [from (signer, writable), to (writable), system_program (readonly)]
      const accounts = [
        { pubkey: solFrom.trim(), isSigner: true, isWritable: true },
        { pubkey: solTo.trim(), isSigner: false, isWritable: true },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ];

      // Instruction data: 4 bytes (instruction index = 2) + 8 bytes (lamports)
      const instructionData = new Uint8Array(12);
      instructionData.set(writeU32LE(2), 0); // Transfer = index 2
      instructionData.set(writeU64LE(lamports), 4);

      const result = buildTransaction(accounts, instructionData, 2, [0, 1]);
      
      setTxDetails({
        type: 'SOL Transfer',
        from: solFrom,
        to: solTo,
        amount: `${solAmount} SOL (${lamports.toLocaleString()} lamports)`,
        size: result.transaction.length
      });

      return result;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, [recentBlockhash, solFrom, solTo, solAmount, buildTransaction]);

  // Build SPL Token Transfer transaction
  const buildTokenTransfer = useCallback(() => {
    setError('');
    setGeneratedTx('');
    setTxDetails(null);

    try {
      if (!recentBlockhash) throw new Error('请先获取 Recent Blockhash');
      if (!isValidPubkey(tokenFrom)) throw new Error('发送方钱包地址无效');
      if (!isValidPubkey(fromAta)) throw new Error('发送方 Token Account 地址无效');
      if (!isValidPubkey(toAta)) throw new Error('接收方 Token Account 地址无效');
      
      const decimals = parseInt(tokenDecimals);
      if (isNaN(decimals) || decimals < 0 || decimals > 18) throw new Error('精度无效');
      
      const rawAmount = BigInt(Math.floor(parseFloat(tokenAmount) * Math.pow(10, decimals)));
      if (rawAmount <= 0) throw new Error('金额无效');

      // Token Transfer instruction
      // Accounts: [source ATA, dest ATA, owner (signer), token_program]
      const accounts = [
        { pubkey: tokenFrom.trim(), isSigner: true, isWritable: false }, // Owner/Authority
        { pubkey: fromAta.trim(), isSigner: false, isWritable: true },   // Source ATA
        { pubkey: toAta.trim(), isSigner: false, isWritable: true },     // Dest ATA
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ];

      // SPL Token Transfer instruction (index 3)
      // Layout: 1 byte instruction + 8 bytes amount
      const instructionData = new Uint8Array(9);
      instructionData.set(writeU8(3), 0); // Transfer = index 3 in Token Program
      instructionData.set(writeU64LE(rawAmount.toString()), 1);

      // For token transfer: accounts order in instruction is [source, dest, owner]
      const result = buildTransaction(accounts, instructionData, 3, [1, 2, 0]);
      
      setTxDetails({
        type: 'SPL Token Transfer',
        from: tokenFrom,
        fromAta,
        toAta,
        mint: tokenMint,
        amount: `${tokenAmount} (raw: ${rawAmount.toString()})`,
        decimals,
        size: result.transaction.length
      });

      return result;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, [recentBlockhash, tokenFrom, fromAta, toAta, tokenAmount, tokenDecimals, tokenMint, buildTransaction]);

  // Decode transaction
  const decodeTransaction = useCallback(() => {
    setDecodedResult('');
    try {
      if (!decodeInput.trim()) throw new Error('请输入 Base58 编码的交易');

      const bytes = decodeBase58(decodeInput.trim());
      let offset = 0;

      // Read signature count
      let sigCount = 0, shift = 0;
      while (offset < bytes.length) {
        const byte = bytes[offset++];
        sigCount |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }

      offset += sigCount * 64; // Skip signatures

      // Header
      const numRequiredSignatures = bytes[offset++];
      const numReadonlySignedAccounts = bytes[offset++];
      const numReadonlyUnsignedAccounts = bytes[offset++];

      // Account count
      let accountCount = 0;
      shift = 0;
      while (offset < bytes.length) {
        const byte = bytes[offset++];
        accountCount |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }

      // Accounts
      const accountKeys = [];
      for (let i = 0; i < accountCount; i++) {
        accountKeys.push(encodeBase58(bytes.slice(offset, offset + 32)));
        offset += 32;
      }

      // Blockhash
      const blockhash = encodeBase58(bytes.slice(offset, offset + 32));
      offset += 32;

      // Instruction count
      let instructionCount = 0;
      shift = 0;
      while (offset < bytes.length) {
        const byte = bytes[offset++];
        instructionCount |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }

      // Instructions
      const instructions = [];
      for (let i = 0; i < instructionCount; i++) {
        const programIdIndex = bytes[offset++];

        let accCount = 0;
        shift = 0;
        while (offset < bytes.length) {
          const byte = bytes[offset++];
          accCount |= (byte & 0x7f) << shift;
          if ((byte & 0x80) === 0) break;
          shift += 7;
        }

        const accountIndices = Array.from(bytes.slice(offset, offset + accCount));
        offset += accCount;

        let dataLen = 0;
        shift = 0;
        while (offset < bytes.length) {
          const byte = bytes[offset++];
          dataLen |= (byte & 0x7f) << shift;
          if ((byte & 0x80) === 0) break;
          shift += 7;
        }

        const data = bytes.slice(offset, offset + dataLen);
        offset += dataLen;

        instructions.push({
          programIdIndex,
          programId: accountKeys[programIdIndex],
          accountIndices,
          accounts: accountIndices.map(idx => accountKeys[idx]),
          data: bytesToHex(data),
        });
      }

      setDecodedResult(JSON.stringify({
        totalSize: bytes.length,
        signatureCount: sigCount,
        header: { numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts },
        accounts: accountKeys,
        recentBlockhash: blockhash,
        instructions
      }, null, 2));
    } catch (e) {
      setDecodedResult(`Error: ${e.message}`);
    }
  }, [decodeInput]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-slate-900 to-slate-800 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-1 bg-gradient-to-r from-green-400 to-purple-400 bg-clip-text text-transparent">
            Solana Transaction Generator
          </h1>
          <p className="text-slate-400 text-sm">构建交易并生成 Base58 编码字符串</p>
        </div>

        {/* RPC & Blockhash */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 mb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-slate-400 mb-1">RPC 节点</label>
              <div className="flex gap-2">
                <select
                  value={rpcEndpoint}
                  onChange={(e) => setRpcEndpoint(e.target.value)}
                  className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm"
                >
                  {Object.keys(RPC_ENDPOINTS).map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  <option value="Custom">Custom</option>
                </select>
                {rpcEndpoint === 'Custom' && (
                  <input
                    type="text"
                    value={customRpc}
                    onChange={(e) => setCustomRpc(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm"
                  />
                )}
              </div>
            </div>
            <div className="flex-1 min-w-[280px]">
              <label className="block text-xs text-slate-400 mb-1">Recent Blockhash</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={recentBlockhash}
                  onChange={(e) => setRecentBlockhash(e.target.value)}
                  placeholder="点击获取按钮..."
                  className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm font-mono"
                />
                <button
                  onClick={fetchBlockhash}
                  disabled={isLoadingBlockhash}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                >
                  {isLoadingBlockhash ? '⏳ 获取中...' : '🔗 获取'}
                </button>
              </div>
            </div>
          </div>
          {recentBlockhash && (
            <p className="text-xs text-green-400 mt-2">✓ Blockhash 已获取，约 1-2 分钟内有效</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-800/30 p-1 rounded-lg">
          {[
            { id: 'sol-transfer', label: '💰 SOL 转账' },
            { id: 'token-transfer', label: '🪙 Token 转账' },
            { id: 'decoder', label: '🔍 解码' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setError(''); setGeneratedTx(''); }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* SOL Transfer Tab */}
        {activeTab === 'sol-transfer' && (
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">SOL 转账</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">From (发送方地址)</label>
                  <input
                    type="text"
                    value={solFrom}
                    onChange={(e) => setSolFrom(e.target.value)}
                    placeholder="发送方的钱包公钥"
                    className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-sm font-mono ${
                      solFrom && !isValidPubkey(solFrom) ? 'border-red-500' : 'border-slate-600'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">To (接收方地址)</label>
                  <input
                    type="text"
                    value={solTo}
                    onChange={(e) => setSolTo(e.target.value)}
                    placeholder="接收方的钱包公钥"
                    className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-sm font-mono ${
                      solTo && !isValidPubkey(solTo) ? 'border-red-500' : 'border-slate-600'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Amount (SOL)</label>
                  <input
                    type="text"
                    value={solAmount}
                    onChange={(e) => setSolAmount(e.target.value)}
                    placeholder="0.01"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    = {Math.floor(parseFloat(solAmount || '0') * 1e9).toLocaleString()} lamports
                  </p>
                </div>
              </div>

              <button
                onClick={buildSolTransfer}
                className="mt-4 w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 rounded-xl font-bold transition-all"
              >
                🚀 生成 Base58 交易
              </button>
            </div>
          </div>
        )}

        {/* Token Transfer Tab */}
        {activeTab === 'token-transfer' && (
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">SPL Token 转账</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Token Mint (代币合约地址)</label>
                  <input
                    type="text"
                    value={tokenMint}
                    onChange={(e) => setTokenMint(e.target.value)}
                    placeholder="Token Mint 地址"
                    className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-sm font-mono ${
                      tokenMint && !isValidPubkey(tokenMint) ? 'border-red-500' : 'border-slate-600'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">From Wallet (发送方钱包)</label>
                    <input
                      type="text"
                      value={tokenFrom}
                      onChange={(e) => setTokenFrom(e.target.value)}
                      placeholder="发送方钱包地址"
                      className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-sm font-mono ${
                        tokenFrom && !isValidPubkey(tokenFrom) ? 'border-red-500' : 'border-slate-600'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">To Wallet (接收方钱包)</label>
                    <input
                      type="text"
                      value={tokenTo}
                      onChange={(e) => setTokenTo(e.target.value)}
                      placeholder="接收方钱包地址"
                      className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-sm font-mono ${
                        tokenTo && !isValidPubkey(tokenTo) ? 'border-red-500' : 'border-slate-600'
                      }`}
                    />
                  </div>
                </div>

                <button
                  onClick={autoFetchAtas}
                  className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
                >
                  🔍 自动获取 Token Accounts (ATA)
                </button>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">From Token Account</label>
                    <input
                      type="text"
                      value={fromAta}
                      onChange={(e) => setFromAta(e.target.value)}
                      placeholder="发送方的 Token Account"
                      className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-sm font-mono ${
                        fromAta && !isValidPubkey(fromAta) ? 'border-red-500' : 'border-slate-600'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">To Token Account</label>
                    <input
                      type="text"
                      value={toAta}
                      onChange={(e) => setToAta(e.target.value)}
                      placeholder="接收方的 Token Account"
                      className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-sm font-mono ${
                        toAta && !isValidPubkey(toAta) ? 'border-red-500' : 'border-slate-600'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Amount (数量)</label>
                    <input
                      type="text"
                      value={tokenAmount}
                      onChange={(e) => setTokenAmount(e.target.value)}
                      placeholder="1"
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Decimals (精度)</label>
                    <input
                      type="number"
                      value={tokenDecimals}
                      onChange={(e) => setTokenDecimals(e.target.value)}
                      min="0"
                      max="18"
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Raw amount = {tokenAmount || '0'} × 10^{tokenDecimals || '0'} = {
                    (() => {
                      try {
                        return BigInt(Math.floor(parseFloat(tokenAmount || '0') * Math.pow(10, parseInt(tokenDecimals) || 0))).toString();
                      } catch {
                        return '0';
                      }
                    })()
                  }
                </p>
              </div>

              <button
                onClick={buildTokenTransfer}
                className="mt-4 w-full py-3 bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-400 hover:to-pink-500 rounded-xl font-bold transition-all"
              >
                🚀 生成 Base58 交易
              </button>
            </div>
          </div>
        )}

        {/* Decoder Tab */}
        {activeTab === 'decoder' && (
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <label className="block text-xs text-slate-400 mb-2">Base58 编码的交易</label>
              <textarea
                value={decodeInput}
                onChange={(e) => setDecodeInput(e.target.value)}
                placeholder="粘贴 Base58 编码的 Solana 交易..."
                className="w-full h-28 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 font-mono text-sm resize-none"
              />
              <button
                onClick={decodeTransaction}
                className="mt-3 w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 rounded-xl font-bold transition-all"
              >
                🔍 解码交易
              </button>
            </div>

            {decodedResult && (
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold">解码结果</h3>
                  <button
                    onClick={() => navigator.clipboard.writeText(decodedResult)}
                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs"
                  >
                    📋 Copy
                  </button>
                </div>
                <pre className="bg-slate-900 rounded-lg p-3 overflow-x-auto text-xs text-slate-300 max-h-80 overflow-y-auto">
                  {decodedResult}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-4 bg-red-900/50 border border-red-500 rounded-xl p-3">
            <p className="text-red-300 text-sm">❌ {error}</p>
          </div>
        )}

        {/* Generated Result */}
        {generatedTx && (
          <div className="mt-4 bg-slate-800/50 rounded-xl p-4 border border-green-500/50">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-green-400">✅ 生成成功</h3>
              <button
                onClick={() => navigator.clipboard.writeText(generatedTx)}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs"
              >
                📋 Copy
              </button>
            </div>
            
            {txDetails && (
              <div className="mb-3 text-xs text-slate-400 space-y-0.5">
                <p>类型: {txDetails.type}</p>
                <p>大小: {txDetails.size} bytes</p>
                {txDetails.amount && <p>数量: {txDetails.amount}</p>}
              </div>
            )}
            
            <div className="bg-slate-900 rounded-lg p-3 break-all font-mono text-xs text-green-300 max-h-40 overflow-y-auto">
              {generatedTx}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              ⚠️ 这是未签名的交易，需要用私钥签名后才能提交到链上
            </p>
          </div>
        )}

        {/* Info */}
        <div className="mt-6 text-center text-xs text-slate-500 space-y-1">
          <p>System Program: {SYSTEM_PROGRAM_ID}</p>
          <p>Token Program: {TOKEN_PROGRAM_ID}</p>
        </div>
      </div>
    </div>
  );
}
