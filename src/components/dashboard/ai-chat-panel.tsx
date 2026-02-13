import { Button } from "@/components/ui/button"
import {
  BarChart3,
  Code2,
  Globe,
  Lightbulb,
  Mic,
  MoreHorizontal,
  Paperclip,
  Sparkles,
  Text,
  Calculator,
} from "lucide-react"

const quickActions = [
  { label: "解释概念", icon: Lightbulb },
  { label: "举个例子", icon: Sparkles },
  { label: "总结重点", icon: Text },
  { label: "生成练习", icon: Code2 },
  { label: "分析数据", icon: BarChart3 },
  { label: "更多", icon: MoreHorizontal },
]

export function AiChatPanel() {
  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-zinc-900/50 px-4 py-4 sm:px-5 sm:py-5 text-zinc-200">
      <div className="flex-1 overflow-auto pr-1 pt-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <div className="flex justify-end mb-8">
          <div className="bg-zinc-800 text-zinc-100 px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%] text-sm leading-relaxed shadow-sm space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[10px] text-blue-300 font-medium bg-blue-500/10 px-2 py-0.5 rounded-full w-fit">
              <span className="size-1.5 rounded-full bg-blue-400" />
              05:23
            </div>
            <p>看到 05:23 的基向量变换有点困惑，为什么 i-hat 变换后坐标会变？</p>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-zinc-100">
            关于 05:23 的基向量变换
          </h2>

          <div className="space-y-4 text-sm text-zinc-400">
            <div>
              <p className="leading-relaxed">
                在 05:23 的画面里，老师不是在“改变向量本身”，而是在
                <span className="font-semibold text-zinc-200">改变基底</span>。当基底从
                <span className="font-mono text-zinc-300">i-hat, j-hat</span> 变为新的基向量时，
                同一个向量的
                <span className="font-semibold text-zinc-200">坐标表示</span>会随之变化。
              </p>
              <ul className="mt-3 space-y-2">
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 rounded-full bg-zinc-600 shrink-0" />
                  <span>
                    <span className="font-medium text-zinc-300">向量不变</span>：它仍然指向同一个几何方向。
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 rounded-full bg-zinc-600 shrink-0" />
                  <span>
                    <span className="font-medium text-zinc-300">坐标改变</span>：因为新基底的“尺子”变了。
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl bg-zinc-800/50 p-4 border border-zinc-700/50">
              <p className="font-medium text-zinc-200 mb-2 flex items-center gap-2">
                <Calculator className="size-4 text-blue-400" />
                直观理解
              </p>
              <p className="leading-relaxed">
                就像你换了一把刻度不同的尺子去量同一条线，长度本身没变，
                但“读出来的数值”会变。基向量就是那把尺子。
              </p>
            </div>
          </div>

          <div className="text-sm text-zinc-400 pt-2 border-t border-zinc-800/50">
            <p className="font-semibold text-zinc-200 mb-2">相关概念推荐</p>
            <div className="flex flex-wrap gap-2">
              {["线性子空间", "基与维数", "线性变换"].map((item) => (
                <span key={item} className="px-2 py-1 rounded-md bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700 cursor-pointer transition-colors">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <action.icon className="mr-1.5 size-3.5" />
              {action.label}
            </Button>
          ))}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-sm transition-colors focus-within:border-zinc-700 focus-within:bg-zinc-900">
          <textarea
            rows={2}
            placeholder="问点什么..."
            className="w-full resize-none bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-full border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                <Paperclip className="mr-1 size-3.5" />
                附件
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-full border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                <Globe className="mr-1 size-3.5" />
                搜索
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-full border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            >
              <Mic className="mr-1 size-3.5" />
              语音
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
