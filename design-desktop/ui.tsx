import React, { useState } from 'react';
import { 
  Folder, Plus, LayoutDashboard, BookOpen, GitPullRequest, 
  Settings, CheckCircle, ChevronRight, MessageSquare, 
  ArrowRight, Search, FileText, Box, ArrowLeft,
  FileCode2, CheckSquare, GitCommit, Expand, AlignLeft,
  Library, GitMerge, FileArchive, Zap, Sidebar, GitBranch,
  PlayCircle
} from 'lucide-react';

// --- Mock Data ---
const MOCK_FEATURES = [
  { id: 'f1', name: 'payment-refactor', objective: '重构支付网关以支持幂等回调', stage: 'implementation', active: true, time: '2小时前' },
  { id: 'f2', name: 'auth-overhaul', objective: '迁移至 OAuth2.0 体系', stage: 'solution-design', active: false, time: '1天前' },
];

const MOCK_ADRS = [
  { id: 'adr1', title: 'ADR-012: 支付回调采用 Redis 分布式锁', status: 'Accepted', date: '2023-10-24' },
  { id: 'adr2', title: 'ADR-011: 订单状态机拆分为独立模块', status: 'Proposed', date: '2023-10-20' },
];

const MOCK_DOCS = [
  { id: 'd1', title: 'payment-callback-analysis.md', type: 'markdown', stage: 'analyze-current' },
  { id: 'd2', title: 'solution-design.md', type: 'markdown', stage: 'solution-design' },
  { id: 'd3', title: 'implementation-plan.md', type: 'markdown', stage: 'implementation' }
];

const MOCK_CHANGES = [
  { id: 'c1', file: 'mall-payment/src/CallbackController.java', status: 'modified' },
  { id: 'c2', file: 'mall-order/src/OrderStateMachine.java', status: 'added' }
];

// --- 核心布局组件 (工作空间层) ---

const GlobalSidebar = ({ currentView, currentFeature, onViewChange }) => {
  const navItems = [
    { id: 'overview', icon: LayoutDashboard, label: '工作空间概览' },
    { id: 'features', icon: GitPullRequest, label: 'Features 执行区' },
    { id: 'knowledge', icon: BookOpen, label: '业务知识图谱' },
    { id: 'architecture', icon: FileArchive, label: '架构与决策 (ADR)' },
    { id: 'repos', icon: Library, label: '代码库基座' },
  ];

  return (
    <div className="w-64 bg-[#1e293b] text-slate-300 flex flex-col h-full shrink-0 transition-all duration-300">
      <div className="h-14 flex items-center px-4 border-b border-slate-700/50 hover:bg-slate-800 cursor-pointer transition-colors">
        <div className="w-6 h-6 bg-indigo-500 rounded flex items-center justify-center text-white font-bold text-xs mr-3">M</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-100 truncate">mall-core</div>
          <div className="text-[10px] text-slate-500 truncate">大培 Workspace</div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500" />
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-3 space-y-1">
          {navItems.map(item => {
            const isActive = currentView === item.id;
            return (
              <div 
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`flex items-center px-3 py-2 rounded-lg cursor-pointer text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <item.icon className={`w-4 h-4 mr-3 ${isActive ? 'text-indigo-200' : 'text-slate-400'}`} />
                {item.label}
              </div>
            );
          })}
        </div>

        <div className="mt-8 px-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">
            活跃的 Features
          </div>
          <div className="space-y-1">
            {MOCK_FEATURES.map(f => (
              <div 
                key={f.id}
                onClick={() => onViewChange('feature-detail')}
                className={`flex items-center px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors text-slate-400 hover:bg-slate-800 hover:text-slate-200 group`}
              >
                {f.active ? <span className="w-2 h-2 bg-emerald-500 rounded-full mr-3 animate-pulse"></span> : <span className="w-2 h-2 bg-slate-600 rounded-full mr-3"></span>}
                <span className="truncate flex-1">{f.name}</span>
                <PlayCircle className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-700/50">
        <div className="flex items-center px-3 py-2 text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors">
          <Settings className="w-4 h-4 mr-3" /> Workspace 设置
        </div>
      </div>
    </div>
  );
};

const TopBar = ({ breadcrumbs, onToggleSidebar }) => (
  <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 select-none shrink-0">
    <div className="flex items-center space-x-2">
      <button onClick={onToggleSidebar} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-md mr-1">
        <Sidebar className="w-4 h-4" />
      </button>
      <div className="flex items-center text-sm font-medium">
        {breadcrumbs.map((bc, idx) => (
          <React.Fragment key={idx}>
            <span className={idx === breadcrumbs.length - 1 ? 'text-slate-800' : 'text-slate-500 hover:text-slate-800 cursor-pointer'}>
              {bc}
            </span>
            {idx < breadcrumbs.length - 1 && <ChevronRight className="w-4 h-4 mx-1 text-slate-300" />}
          </React.Fragment>
        ))}
      </div>
    </div>
    <div className="flex items-center bg-slate-50 border border-slate-200 text-slate-400 text-xs px-3 py-1.5 rounded-md w-64 shadow-inner cursor-text hover:border-slate-300 transition-colors">
      <Search className="w-3.5 h-3.5 mr-2" /> 搜索 (⌘K)
    </div>
  </div>
);

// --- 视图组件: Workspace Dashboard ---

const WorkspaceDashboard = ({ onViewChange }) => (
  <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8">
    <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">mall-core 概览</h1>
          <p className="text-sm text-slate-500">所有维度的资产健康状况与最近活动。</p>
        </div>
        <button onClick={() => onViewChange('features')} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm flex items-center">
          <Plus className="w-4 h-4 mr-2"/> 创建新 Feature
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-sm font-bold text-slate-700 flex items-center">
              <GitPullRequest className="w-4 h-4 mr-2 text-indigo-500" /> 进行中的 Features
            </h2>
            <button onClick={() => onViewChange('features')} className="text-xs text-indigo-600 hover:underline">查看全部</button>
          </div>
          <div className="space-y-3">
            {MOCK_FEATURES.map(f => (
              <div 
                key={f.id} 
                onClick={() => onViewChange('feature-detail')}
                className="bg-white border border-slate-200 rounded-lg p-4 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all group flex items-start"
              >
                <div className="mt-1 mr-3">
                  {f.active ? <span className="flex w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span> : <span className="flex w-2.5 h-2.5 bg-slate-300 rounded-full"></span>}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{f.name}</h3>
                    <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 uppercase">{f.stage}</span>
                  </div>
                  <p className="text-sm text-slate-500">{f.objective}</p>
                </div>
                <div className="ml-4 flex items-center h-full">
                   <button className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-md font-medium opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-100 flex items-center">
                     进入工作台 <ArrowRight className="w-3 h-3 ml-1" />
                   </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-sm font-bold text-slate-700 flex items-center">
              <FileArchive className="w-4 h-4 mr-2 text-amber-500" /> 最近架构决策 (ADR)
            </h2>
          </div>
          <div className="space-y-3">
            {MOCK_ADRS.map(adr => (
              <div key={adr.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:bg-slate-50 cursor-pointer">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${adr.status === 'Accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                    {adr.status}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">{adr.date}</span>
                </div>
                <p className="text-sm font-medium text-slate-700 line-clamp-2">{adr.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// --- 视图组件: Feature 沉浸工作台 (全屏接管版) ---

const MarkdownViewer = ({ doc }) => (
  <div className="h-full bg-white flex flex-col animate-in fade-in duration-300">
    <div className="h-12 border-b border-slate-100 flex items-center justify-between px-8 shrink-0">
      <div className="flex items-center text-slate-600 font-medium text-sm">
        <AlignLeft className="w-4 h-4 mr-2 text-indigo-500"/> {doc.title}
      </div>
      <div className="flex items-center space-x-2 text-xs">
        <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded border border-indigo-100">AI Generated</span>
      </div>
    </div>
    <div className="flex-1 overflow-y-auto p-10 lg:p-16">
      <div className="max-w-3xl mx-auto prose prose-slate prose-indigo prose-sm lg:prose-base">
        <h1>方案设计: 支付回调幂等改造</h1>
        <p>基于前一阶段的现状分析，当前 <code>mall-payment</code> 的回调接口存在数据库并发写入导致的状态不一致风险。本方案提出使用 Redis 分布式锁结合唯一索引进行改造。</p>
        
        <div className="bg-slate-50 p-5 rounded-lg border border-slate-200 font-mono text-xs text-slate-600 my-6 whitespace-pre overflow-x-auto shadow-inner">
{`Webhook -> API Gateway -> PaymentService
   |
   |-- 1. Check Redis Lock (key: req.biz_id)
   |      |-- [Locked] -> Return "Processing"
   |      |-- [Acquired] -> Continue
   |
   |-- 2. Check DB status (status == PAYING?)
   |      |-- [No] -> Return "Success"
   |      |-- [Yes] -> Update DB & State Machine`}
        </div>
        
        <div className="bg-amber-50 border-l-4 border-amber-400 p-5 mt-6 rounded-r-lg">
          <p className="text-amber-800 text-sm m-0"><strong>Agent 提示:</strong> 此方案已通过架构规则校验，未发现明显阻碍。点击左侧的 "进入实现阶段" 将开始代码修改。</p>
        </div>
      </div>
    </div>
  </div>
);

const CodeDiffViewer = ({ change }) => (
  <div className="h-full bg-[#1e1e1e] flex flex-col animate-in fade-in duration-300 text-slate-300">
    <div className="h-12 border-b border-[#333] flex items-center justify-between px-8 shrink-0 bg-[#252526]">
      <div className="flex items-center text-slate-300 font-mono text-sm">
        <FileCode2 className="w-4 h-4 mr-2 text-emerald-500"/> {change.file}
      </div>
    </div>
    <div className="flex-1 overflow-y-auto p-6 font-mono text-sm leading-relaxed">
      <div className="bg-[#1e1e1e] rounded border border-[#333] overflow-hidden max-w-5xl mx-auto">
        <div className="flex hover:bg-[#2a2d2e]"><div className="w-12 text-right pr-4 text-slate-600 select-none border-r border-[#333]">42</div><div className="pl-4 text-slate-400">    public String handleCallback(PaymentReq req) {'{'}</div></div>
        <div className="flex bg-red-900/20"><div className="w-12 text-right pr-4 text-slate-500 select-none border-r border-[#333]">44</div><div className="pl-4 text-red-300"><span className="text-red-500 mr-2">-</span>        <span className="bg-red-900/40">Order order = orderService.findById(req.getOrderId());</span></div></div>
        <div className="flex bg-emerald-900/20"><div className="w-12 text-right pr-4 text-slate-500 select-none border-r border-[#333]">44</div><div className="pl-4 text-emerald-300"><span className="text-emerald-500 mr-2">+</span>        <span className="bg-emerald-900/40">RLock lock = redissonClient.getLock("pay_cb_" + req.getBizId());</span></div></div>
        <div className="flex bg-emerald-900/20"><div className="w-12 text-right pr-4 text-slate-500 select-none border-r border-[#333]">45</div><div className="pl-4 text-emerald-300"><span className="text-emerald-500 mr-2">+</span>        <span className="bg-emerald-900/40">if (!lock.tryLock(3, TimeUnit.SECONDS)) {'{'}</span></div></div>
      </div>
    </div>
  </div>
);

// [修改核心] FeatureWorkbench 成为独立的全屏接管组件
const FeatureWorkbench = ({ onBack }) => {
  const [activeViewer, setActiveViewer] = useState({ type: 'doc', id: 'd2' });

  const activeDoc = MOCK_DOCS.find(d => d.id === activeViewer?.id);
  const activeChange = MOCK_CHANGES.find(c => c.id === activeViewer?.id);

  return (
    <div className="flex-1 flex flex-col h-screen w-full bg-white animate-in slide-in-from-right-4 duration-300">
      
      {/* 专属的沉浸式 Header，替代了全局的 TopBar */}
      <div className="h-16 border-b border-slate-200 bg-white flex items-center px-6 shrink-0 z-20 shadow-sm">
        
        {/* 左侧：返回动作与上下文 */}
        <div className="flex items-center w-1/4">
          <button 
            onClick={onBack}
            className="flex items-center text-slate-500 hover:text-slate-900 transition-colors mr-5 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-md text-sm font-medium border border-slate-200"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> 退出工作台
          </button>
          <div className="h-5 w-px bg-slate-300 mr-5"></div>
          <div className="flex items-center text-slate-800 font-bold">
            <GitBranch className="w-4 h-4 mr-2 text-orange-500"/> payment-refactor
          </div>
        </div>

        {/* 中间：居中的流程进度条 (Stage Stepper) */}
        <div className="flex-1 flex justify-center items-center">
          <div className="flex items-center space-x-2 md:space-x-4 w-full max-w-2xl">
            {['现状分析', '方案设计', '代码实现', '测试验证', '评审验收'].map((stage, idx) => (
              <React.Fragment key={stage}>
                <div className={`flex items-center ${idx === 1 ? 'text-indigo-600 font-bold' : idx < 1 ? 'text-slate-600' : 'text-slate-400'}`}>
                  {idx < 1 ? <CheckCircle className="w-4 h-4 mr-1.5"/> : <div className={`w-4 h-4 rounded-full border-2 mr-1.5 ${idx === 1 ? 'border-indigo-600' : 'border-slate-300'}`}></div>}
                  <span className="text-sm hidden lg:inline">{stage}</span>
                </div>
                {idx < 4 && <div className={`flex-1 h-px max-w-[80px] ${idx < 1 ? 'bg-indigo-300' : 'bg-slate-200'}`}></div>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* 右侧：状态与操作 */}
        <div className="flex justify-end items-center w-1/4">
          <span className="flex items-center px-3 py-1.5 bg-orange-50 text-orange-800 rounded-md text-xs font-medium border border-orange-200 mr-4">
            <span className="w-2 h-2 bg-orange-500 rounded-full mr-2 animate-pulse"></span>
            Agent 在线 · 隔离区
          </span>
        </div>
      </div>

      {/* 双栏内容区：因为少了全局侧边栏，这里获得了巨大的水平空间 */}
      <div className="flex-1 flex min-h-0 bg-slate-100/50">
        
        {/* 左侧：Agent Chat & 交付物列表 (加宽至 w-[28rem] 或 400px，提升阅读体验) */}
        <div className="w-[28rem] flex flex-col border-r border-slate-200 bg-white shrink-0 shadow-[4px_0_15px_rgba(0,0,0,0.03)] z-10">
          <div className="h-[40%] border-b border-slate-200 flex flex-col shrink-0 bg-slate-50">
            <div className="px-5 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider flex items-center bg-slate-100/80">
               上下文交付物
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-5">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-2">架构与设计文档</div>
                {MOCK_DOCS.map(doc => (
                  <div 
                    key={doc.id} onClick={() => setActiveViewer({ type: 'doc', id: doc.id })}
                    className={`flex items-center px-3 py-2 rounded-md cursor-pointer transition-colors ${activeViewer.id === doc.id ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-200'}`}
                  >
                    <FileText className={`w-4 h-4 mr-3 ${activeViewer.id === doc.id ? 'text-indigo-500' : 'text-slate-400'}`}/>
                    <span className="text-sm truncate">{doc.title}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-2">代码 Diff</div>
                {MOCK_CHANGES.map(change => (
                  <div 
                    key={change.id} onClick={() => setActiveViewer({ type: 'code', id: change.id })}
                    className={`flex items-center px-3 py-2 rounded-md cursor-pointer transition-colors ${activeViewer.id === change.id ? 'bg-emerald-100 text-emerald-800 font-medium' : 'text-slate-600 hover:bg-slate-200'}`}
                  >
                    <GitCommit className={`w-4 h-4 mr-3 ${activeViewer.id === change.id ? 'text-emerald-600' : 'text-slate-400'}`}/>
                    <span className="text-sm truncate">{change.file.split('/').pop()}</span>
                    {change.status === 'added' && <span className="ml-auto text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded">A</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-white">
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
               <div className="flex flex-col items-end">
                  <div className="bg-indigo-600 text-white p-4 rounded-xl rounded-tr-sm max-w-[90%] text-sm shadow-sm leading-relaxed">
                    @dapei 根据方案生成具体实现代码，注意引入 Redisson 锁。
                  </div>
               </div>
               <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mr-3 shrink-0"><Zap className="w-4 h-4 text-indigo-600"/></div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 p-4 rounded-xl rounded-tl-sm leading-relaxed">
                      好的。已在沙盒中完成代码实现，主要修改了 <code>CallbackController.java</code>。请点击上方 Diff 进行评审。
                    </p>
                  </div>
               </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-white">
              <div className="relative">
                <textarea 
                  placeholder="输入要求指挥 Agent..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none h-14 shadow-inner"
                />
                <button className="absolute right-2.5 bottom-2.5 p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors shadow-sm">
                  <ArrowRight className="w-4 h-4"/>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：动态检视器 (独占绝大部分屏幕) */}
        <div className="flex-1 bg-slate-100/50 relative">
          {activeViewer.type === 'doc' && activeDoc && <MarkdownViewer doc={activeDoc} />}
          {activeViewer.type === 'code' && activeChange && <CodeDiffViewer change={activeChange} />}
        </div>
      </div>
    </div>
  );
};


// --- 主应用入口 ---

export default function App() {
  const [currentView, setCurrentView] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const getBreadcrumbs = () => {
    const base = ['mall-core'];
    switch (currentView) {
      case 'knowledge': return [...base, '业务知识图谱'];
      case 'architecture': return [...base, '架构与决策'];
      case 'repos': return [...base, '代码库基座'];
      default: return [...base, '工作空间概览'];
    }
  };

  // 重点：当处于 feature-detail 模式时，直接返回独立的全屏组件，跳过外层的 Sidebar 和 Topbar
  if (currentView === 'feature-detail') {
    return <FeatureWorkbench onBack={() => setCurrentView('overview')} />;
  }

  // 正常的工作空间布局
  return (
    <div className="h-screen w-full flex bg-slate-100 font-sans overflow-hidden text-slate-900">
      
      {sidebarOpen && (
        <GlobalSidebar 
          currentView={currentView} 
          onViewChange={setCurrentView} 
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 bg-white shadow-[-4px_0_15px_rgba(0,0,0,0.05)] z-10">
        
        <TopBar 
          breadcrumbs={getBreadcrumbs()} 
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
        
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          {currentView === 'overview' && <WorkspaceDashboard onViewChange={setCurrentView} />}
          
          {['knowledge', 'architecture', 'repos'].includes(currentView) && (
             <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400">
                <FileArchive className="w-16 h-16 mb-4 opacity-20" />
                <h2 className="text-xl font-medium mb-2">进入 {currentView} 维度</h2>
             </div>
          )}
        </div>

      </div>
    </div>
  );
}