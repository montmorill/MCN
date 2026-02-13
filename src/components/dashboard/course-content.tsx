import { Button } from "@/components/ui/button"
import type { Course, CourseItem, CourseUnit } from "@/types/course"
import { ChevronRight, Play, StickyNote, FileQuestion, Pencil } from "lucide-react"

interface CourseContentProps {
  course: Course
  unit: CourseUnit
  item: CourseItem
}

export function CourseContent({ course, unit, item }: CourseContentProps) {
  const isVideo = item.type === "video"

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] px-6 py-6 sm:px-10 sm:py-8">
      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
        {isVideo && (
          <div className="mb-8">
            <div className="relative aspect-video w-full rounded-xl bg-zinc-800 overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/10 mb-6 group">
              <img 
                src="https://img.youtube.com/vi/fNk_zzaMoSs/maxresdefault.jpg" 
                alt="Vectors | Chapter 1, Essence of linear algebra" 
                className="absolute inset-0 w-full h-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
              />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  type="button"
                  className="flex size-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-md transition-all hover:bg-white/20 hover:scale-105 active:scale-95"
                >
                  <Play className="size-6 text-white fill-white ml-1" />
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
              <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between text-white/90 text-sm font-medium">
                <span>0:00 / 9:22</span>
                <span className="hover:text-white cursor-pointer transition-colors">1x</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                className="h-9 rounded-full border border-blue-500/30 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 gap-2 px-4 text-xs sm:text-sm font-medium transition-colors"
              >
                <StickyNote className="size-4" />
                生成笔记
              </Button>
              <Button
                variant="secondary"
                className="h-9 rounded-full border border-blue-500/30 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 gap-2 px-4 text-xs sm:text-sm font-medium transition-colors"
              >
                <FileQuestion className="size-4" />
                生成小测
              </Button>
              <Button
                variant="secondary"
                className="h-9 rounded-full border border-blue-500/30 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 gap-2 px-4 text-xs sm:text-sm font-medium transition-colors"
              >
                <Pencil className="size-4" />
                刷题
              </Button>
            </div>
          </div>
        )}

        {/* 头部信息区：优化层级关系，移除眉题，Unit信息下移到标题下方作为辅助信息 */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-100 mb-4 leading-tight">
            {item.title}
          </h1>
          
          <p className="text-lg text-zinc-400 leading-relaxed max-w-2xl">
            {item.description}
          </p>
        </div>

        {/* 分割线 */}
        <div className="h-px w-full bg-zinc-800 mb-8" />

        {/* 正文内容区：优化排版与间距 */}
        <div className="space-y-6 text-[15px] leading-7 text-zinc-300">
          <p className="text-zinc-300">
            感谢您报名参加本课程。本章节作为课程的核心引导部分，将为您构建完整的知识框架。您可以随时查阅
            <span className="text-zinc-100 font-medium hover:underline cursor-pointer border-b border-zinc-700 hover:border-zinc-100 transition-colors mx-1 pb-0.5">
              教学大纲
            </span>
            以获取更多进度信息。
          </p>

          <div className="my-8">
            <h3 className="text-sm font-semibold text-zinc-100 mb-4 uppercase tracking-wider">
              本节重点
            </h3>
            <ul className="space-y-3">
              {[
                "讲座视频、讲座幻灯片、编程作业和问题将每周发布",
                "我们的教科书是材料的基本参考，授课内容自成体系",
                "图书网站向所有人开放，包含大量补充信息，支持在线交互式学习",
                "完成本节后，建议立即进行相关的小测验以巩固知识点"
              ].map((text, i) => (
                <li key={i} className="flex gap-3 items-start group">
                  <span className="mt-2.5 size-1.5 rounded-full bg-zinc-600 group-hover:bg-zinc-400 transition-colors shrink-0" />
                  <span className="group-hover:text-zinc-200 transition-colors">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p>
            我们鼓励您在学习过程中积极记笔记，并利用右侧的 AI 助手进行实时问答。所有的学习进度将自动保存，您可以随时暂停并继续您的学习旅程。
          </p>
        </div>
      </div>

      <div className="mt-12 flex items-center justify-end border-t border-zinc-800/80 pt-6">
        <Button
          variant="outline"
          className="gap-2 rounded-full bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          转到下一个课程内容
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </section>
  )
}
