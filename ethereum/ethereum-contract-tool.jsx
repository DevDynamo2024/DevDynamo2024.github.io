import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Copy, Loader2, Info } from 'lucide-react';

const EthereumContractTool = () => {
  const [rpcUrl, setRpcUrl] = useState('https://eth.llamarpc.com');
  const [contractAddress, setContractAddress] = useState('');
  const [abi, setAbi] = useState('');
  const [finalizedBlock, setFinalizedBlock] = useState(null);
  const [readMethods, setReadMethods] = useState([]);
  const [writeMethods, setWriteMethods] = useState([]);
  const [activeTab, setActiveTab] = useState('read');
  const [loadingStates, setLoadingStates] = useState({});
  const [error, setError] = useState('');
  const [methodResults, setMethodResults] = useState({});
  const [methodInputs, setMethodInputs] = useState({});
  const [methodBlockHeights, setMethodBlockHeights] = useState({});

  // 获取最新的finalized区块
  const fetchFinalizedBlock = async () => {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: ['finalized', false],
          id: 1
        })
      });
      const data = await response.json();
      if (data.result) {
        const blockNumber = parseInt(data.result.number, 16);
        setFinalizedBlock(blockNumber);
        return blockNumber;
      }
    } catch (err) {
      console.error('获取区块失败:', err);
    }
  };

  // 初始化时获取finalized区块
  useEffect(() => {
    if (rpcUrl) {
      fetchFinalizedBlock();
    }
  }, [rpcUrl]);

  // 解析ABI
  const parseABI = () => {
    try {
      const parsedAbi = JSON.parse(abi);

      // 分离读方法和写方法
      const reads = parsedAbi.filter(
        item => item.type === 'function' &&
        (item.stateMutability === 'view' || item.stateMutability === 'pure')
      );

      const writes = parsedAbi.filter(
        item => item.type === 'function' &&
        (item.stateMutability === 'nonpayable' || item.stateMutability === 'payable')
      );

      setReadMethods(reads);
      setWriteMethods(writes);
      setError('');

      // 初始化所有方法的输入
      const inputs = {};
      [...reads, ...writes].forEach(method => {
        inputs[method.name] = method.inputs.map(() => '');
      });
      setMethodInputs(inputs);
    } catch (err) {
      setError('ABI 解析失败，请检查格式');
    }
  };

  // Keccak-256 implementation (same as Ethereum's keccak256)
  const keccak256 = (str) => {
    // Simple implementation using a library loaded from CDN
    // This will be replaced with ethers.js keccak256 in the HTML version
    if (typeof ethers !== 'undefined' && ethers.utils && ethers.utils.keccak256) {
      return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(str));
    }
    throw new Error('Keccak256 not available');
  };

  // 编码函数调用数据
  const encodeFunctionData = (method, inputs) => {
    const types = method.inputs.map(input => input.type);
    const signature = `${method.name}(${types.join(',')})`;

    // 计算函数选择器 (使用 Keccak-256)
    const hash = keccak256(signature);
    const selector = hash.slice(0, 10); // '0x' + 8 hex chars (4 bytes)

    // 简化版本：如果没有参数，直接返回选择器
    if (inputs.length === 0) {
      return selector;
    }

    // 对于有参数的情况，使用简单的编码
    let params = '';
    inputs.forEach((input, i) => {
      const type = method.inputs[i].type;
      if (type.startsWith('uint') || type.startsWith('int')) {
        // 数字类型：转换为256位十六进制
        const num = BigInt(input || 0);
        params += num.toString(16).padStart(64, '0');
      } else if (type === 'address') {
        // 地址类型：移除0x并补齐到64位
        const addr = input.replace('0x', '').toLowerCase();
        params += addr.padStart(64, '0');
      } else if (type === 'bool') {
        // 布尔类型
        params += (input === 'true' ? '1' : '0').padStart(64, '0');
      } else if (type === 'bytes32' || type === 'string') {
        // 字符串和bytes32的简单处理
        const hex = input.replace('0x', '');
        params += hex.padStart(64, '0');
      }
    });

    return selector + params;
  };

  // 调用合约方法
  const callMethod = async (method) => {
    const methodName = method.name;

    // 设置当前方法的loading状态
    setLoadingStates(prev => ({ ...prev, [methodName]: true }));

    try {
      const inputs = methodInputs[methodName] || [];
      const blockHeight = methodBlockHeights[methodName] || finalizedBlock;

      // 编码函数调用
      const data = encodeFunctionData(method, inputs);

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{
            to: contractAddress,
            data: data
          }, `0x${blockHeight.toString(16)}`],
          id: 1
        })
      });

      const result = await response.json();

      if (result.error) {
        setMethodResults({
          ...methodResults,
          [methodName]: { error: result.error.message, blockHeight }
        });
      } else {
        // 使用 ethers.js ABI Coder 解析结果
        let decodedResult = result.result;

        try {
          if (method.outputs.length > 0 && result.result !== '0x') {
            // 使用 ethers.js 的 AbiCoder 来解码
            const outputTypes = method.outputs.map(o => o.type);
            const decoded = ethers.utils.defaultAbiCoder.decode(outputTypes, result.result);

            // 格式化解码结果
            if (decoded.length === 1) {
              const value = decoded[0];
              // 处理不同类型的显示
              if (ethers.BigNumber.isBigNumber(value)) {
                decodedResult = value.toString();
              } else if (typeof value === 'boolean') {
                decodedResult = value.toString();
              } else {
                decodedResult = value;
              }
            } else {
              // 多个返回值
              decodedResult = decoded.map(v => {
                if (ethers.BigNumber.isBigNumber(v)) return v.toString();
                if (typeof v === 'boolean') return v.toString();
                return v;
              }).join(', ');
            }
          }
        } catch (decodeError) {
          console.error('Decode error:', decodeError);
          // 如果解码失败，使用原始结果
          decodedResult = result.result;
        }

        setMethodResults({
          ...methodResults,
          [methodName]: {
            success: true,
            data: decodedResult,
            blockHeight,
            raw: result.result
          }
        });
      }
    } catch (err) {
      setMethodResults({
        ...methodResults,
        [methodName]: { error: err.message }
      });
    } finally {
      // 清除当前方法的loading状态
      setLoadingStates(prev => ({ ...prev, [methodName]: false }));
    }
  };

  // 更新方法输入
  const updateMethodInput = (methodName, inputIndex, value) => {
    const newInputs = { ...methodInputs };
    newInputs[methodName][inputIndex] = value;
    setMethodInputs(newInputs);
  };

  // 复制到剪贴板
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">以太坊合约调用工具</h1>
          <p className="text-purple-200">查询智能合约的只读方法</p>
        </div>

        {/* 配置区域 */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                RPC 节点地址
              </label>
              <input
                type="text"
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)}
                className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="https://eth.llamarpc.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                最新 Finalized 区块
              </label>
              <div className="flex gap-2">
                <div className="flex-1 px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white">
                  {finalizedBlock ? `#${finalizedBlock.toLocaleString()}` : '加载中...'}
                </div>
                <button
                  onClick={fetchFinalizedBlock}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors"
                >
                  刷新
                </button>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-purple-200 mb-2">
              合约地址
            </label>
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="0x..."
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-purple-200 mb-2">
              合约 ABI (JSON 格式)
            </label>
            <textarea
              value={abi}
              onChange={(e) => setAbi(e.target.value)}
              rows={6}
              className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
              placeholder='[{"inputs":[],"name":"totalSupply","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"}]'
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-300 bg-red-500/20 px-4 py-2 rounded-lg mb-4">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={parseABI}
            disabled={!contractAddress || !abi}
            className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-all transform hover:scale-[1.02]"
          >
            解析合约
          </button>
        </div>

        {/* Tab 切换和方法列表 */}
        {(readMethods.length > 0 || writeMethods.length > 0) && (
          <div className="space-y-4">
            {/* Tab 切换 */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setActiveTab('read')}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all ${
                  activeTab === 'read'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg'
                    : 'bg-white/10 text-purple-200 hover:bg-white/20'
                }`}
              >
                Read 方法 ({readMethods.length})
              </button>
              <button
                onClick={() => setActiveTab('write')}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all ${
                  activeTab === 'write'
                    ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-lg'
                    : 'bg-white/10 text-purple-200 hover:bg-white/20'
                }`}
              >
                Write 方法 ({writeMethods.length})
              </button>
            </div>

            <h2 className="text-2xl font-bold text-white mb-4">
              {activeTab === 'read' ? 'Read 方法 (只读)' : 'Write 方法 (写入)'}
            </h2>

            {(activeTab === 'read' ? readMethods : writeMethods).map((method, idx) => (
              <div key={idx} className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-1">
                      {method.name}
                    </h3>
                    <p className="text-sm text-purple-200">
                      {method.stateMutability} • 
                      {method.outputs.length > 0 
                        ? ` 返回: ${method.outputs[0].type}`
                        : ' 无返回值'}
                    </p>
                  </div>
                </div>

                {/* 参数输入 */}
                {method.inputs.length > 0 && (
                  <div className="mb-4 space-y-3">
                    {method.inputs.map((input, inputIdx) => (
                      <div key={inputIdx}>
                        <label className="block text-sm font-medium text-purple-200 mb-1">
                          {input.name || `参数 ${inputIdx + 1}`} ({input.type})
                        </label>
                        <input
                          type="text"
                          value={methodInputs[method.name]?.[inputIdx] || ''}
                          onChange={(e) => updateMethodInput(method.name, inputIdx, e.target.value)}
                          className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder={`输入 ${input.type} 类型的值`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* 区块高度 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-purple-200 mb-1">
                    查询区块高度 (留空使用 Finalized)
                  </label>
                  <input
                    type="number"
                    value={methodBlockHeights[method.name] || ''}
                    onChange={(e) => setMethodBlockHeights({
                      ...methodBlockHeights,
                      [method.name]: e.target.value ? parseInt(e.target.value) : null
                    })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={finalizedBlock ? `默认: ${finalizedBlock}` : ''}
                  />
                </div>

                {/* 调用按钮 */}
                <button
                  onClick={() => callMethod(method)}
                  disabled={loadingStates[method.name]}
                  className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-gray-600 disabled:to-gray-600 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2"
                >
                  {loadingStates[method.name] ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      调用中...
                    </>
                  ) : (
                    '调用方法'
                  )}
                </button>

                {/* 结果显示 */}
                {methodResults[method.name] && (
                  <div className="mt-4">
                    {methodResults[method.name].error ? (
                      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="text-red-300 flex-shrink-0 mt-0.5" size={20} />
                          <div>
                            <p className="text-red-300 font-medium mb-1">调用失败</p>
                            <p className="text-red-200 text-sm font-mono">
                              {methodResults[method.name].error}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4">
                        <div className="flex items-start gap-2 mb-2">
                          <CheckCircle className="text-green-300 flex-shrink-0 mt-0.5" size={20} />
                          <div className="flex-1">
                            <p className="text-green-300 font-medium mb-1">调用成功</p>
                            <p className="text-green-200 text-sm mb-2">
                              区块高度: #{methodResults[method.name].blockHeight?.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="bg-black/30 rounded p-3 mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-purple-300">解码结果:</span>
                            <button
                              onClick={() => copyToClipboard(methodResults[method.name].data)}
                              className="text-purple-300 hover:text-purple-100 transition-colors"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                          <p className="text-white font-mono text-sm break-all">
                            {methodResults[method.name].data}
                          </p>
                        </div>
                        <div className="bg-black/30 rounded p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-purple-300">原始数据:</span>
                            <button
                              onClick={() => copyToClipboard(methodResults[method.name].raw)}
                              className="text-purple-300 hover:text-purple-100 transition-colors"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                          <p className="text-white font-mono text-xs break-all opacity-70">
                            {methodResults[method.name].raw}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 使用提示 */}
        {readMethods.length === 0 && writeMethods.length === 0 && !error && (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-8 border border-white/20 text-center">
            <Info className="mx-auto mb-4 text-purple-300" size={48} />
            <h3 className="text-xl font-semibold text-white mb-2">开始使用</h3>
            <p className="text-purple-200 mb-4">
              填写合约地址和 ABI，然后点击"解析合约"按钮
            </p>
            <div className="text-left max-w-md mx-auto bg-black/30 rounded-lg p-4">
              <p className="text-sm text-purple-200 mb-2">示例合约 (USDT):</p>
              <p className="text-xs text-white font-mono mb-1">地址: 0xdac17f958d2ee523a2206206994597c13d831ec7</p>
              <p className="text-xs text-purple-300">尝试调用 totalSupply, name, symbol 等方法</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EthereumContractTool;