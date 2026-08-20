import './style.css'
import type { CompressRequest } from '../electron/compress'
import type { ArchiveInfo, CompressionSource } from '../electron/archive'
import { mountWatermarkPage } from './watermarkPage'
import { mountSystemInfoPage } from './systemInfoPage'
import { mountDiskCleanPage } from './diskCleanPage'
import { mountPdfPage } from './pdfPage'
import { mountPetSettingsPage } from './petSettingsPage'
import { mountPetChatPage } from './petChatPage'
import { setupAppNavigation, navigateToPage } from './appNavigation'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar">
      <div class="logo">
        <span class="logo-mark">M</span>
        <div class="logo-text">
          <strong>MPT</strong>
          <span>MY PET</span>
        </div>
      </div>
      <div class="pet-sidebar-card">
        <p class="pet-sidebar-title">以宠物为中心</p>
        <p class="pet-sidebar-copy">在桌面右键宠物，可以打开设置、照顾宠物、使用工具箱，或直接和它对话。</p>
      </div>
      <nav class="pet-settings-nav" id="pet-settings-nav" aria-label="宠物设置">
        <button class="nav-item active" type="button" data-pet-tab="profile">基础信息</button>
        <button class="nav-item" type="button" data-pet-tab="character">形象</button>
        <button class="nav-item" type="button" data-pet-tab="appearance">外观与行为</button>
        <button class="nav-item" type="button" data-pet-tab="status">状态</button>
        <button class="nav-item" type="button" data-pet-tab="reminders">交流提醒</button>
      </nav>
      <button class="nav-item pet-chat-sidebar-btn" id="open-pet-chat" type="button">与我对话</button>
      <p class="local-tip">所有工具均在本地完成，不上传文件。</p>
    </aside>

    <main class="workspace">
      <div class="workspace-toolbar" id="workspace-toolbar" hidden>
        <button class="secondary-button workspace-back" id="workspace-back" type="button">← 返回宠物设置</button>
        <span class="workspace-title" id="workspace-title"></span>
      </div>
      <section class="tool-page" id="image-page" hidden>
        <header>
          <div>
            <p class="eyebrow">图像工具</p>
            <h1>图片压缩</h1>
            <p class="subtitle">减小图片体积，同时尽可能保持清晰度。</p>
          </div>
        </header>
        <div class="panel">
        <label class="drop-zone" id="drop-zone" for="file-input">
          <input id="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden />
          <span class="upload-icon">↥</span>
          <strong>拖拽图片到这里，或点击选择</strong>
          <span>支持 JPG、PNG、WebP，单张处理</span>
        </label>

        <div class="editor" id="editor" hidden>
          <div class="preview-card">
            <div class="preview-heading">
              <span>图片预览</span>
              <button class="text-button" id="replace-button" type="button">重新选择</button>
            </div>
            <div class="preview-frame">
              <img id="preview" alt="待压缩图片预览" />
            </div>
            <div class="file-summary">
              <div>
                <strong id="file-name"></strong>
                <span id="file-info"></span>
              </div>
              <span class="size-pill" id="original-size"></span>
            </div>
          </div>

          <div class="settings-card">
            <h2>压缩设置</h2>
            <label class="field">
              <span>输出格式</span>
              <select id="format">
                <option value="auto">保持原格式（推荐）</option>
                <option value="webp">WebP（体积更小）</option>
                <option value="jpeg">JPEG（通用兼容）</option>
                <option value="png">PNG（保留透明）</option>
                <option value="avif">AVIF（最小，新格式）</option>
              </select>
            </label>
            <p class="field-hint">
              PNG 采用调色板量化 + 无损优化，JPEG 采用 mozjpeg 编码，与 TinyPNG 同类算法；
              保持原始尺寸，自动选择压缩强度。
            </p>
            <button class="primary-button" id="compress-button" type="button">开始压缩</button>
          </div>
        </div>

        <div class="result" id="result" hidden>
          <div class="result-copy">
            <span class="success-icon">✓</span>
            <div>
              <strong>压缩完成</strong>
              <span id="result-detail"></span>
            </div>
          </div>
          <button class="download-button" id="download-button" type="button">下载图片</button>
        </div>
        <p class="error-message" id="error-message" role="alert"></p>
        </div>
      </section>

      <section class="tool-page" id="watermark-page" hidden>
        <header>
          <div>
            <p class="eyebrow">视频工具</p>
            <h1>视频去水印</h1>
            <p class="subtitle">粘贴抖音或快手分享链接，解析无水印地址并保存到本地。</p>
          </div>
        </header>
        <div class="panel">
          <div class="watermark-input-card">
            <label class="field" for="watermark-input">
              <span>分享链接 / 分享文案</span>
              <textarea
                id="watermark-input"
                placeholder="例如：0.20 复制打开抖音，看看【xxx的作品】... https://v.douyin.com/xxxxxxx/"
              ></textarea>
            </label>
            <p class="field-hint">
              支持抖音、快手。可直接粘贴 App 分享出来的整段文案；解析出的地址带时效签名，过期后需重新解析。
            </p>
            <button class="primary-button" id="watermark-parse-button" type="button">开始解析</button>
          </div>

          <div class="watermark-editor" id="watermark-editor" hidden>
            <div class="preview-card">
              <div class="preview-heading">
                <span>预览</span>
              </div>
              <div class="preview-frame watermark-preview">
                <video id="watermark-player" controls playsinline preload="metadata"></video>
                <img id="watermark-picture" alt="图集预览" hidden />
              </div>
              <div class="watermark-gallery" id="watermark-gallery" hidden></div>
            </div>

            <div class="settings-card">
              <h2>解析结果</h2>
              <dl class="watermark-meta">
                <div>
                  <dt>作者</dt>
                  <dd id="watermark-author">-</dd>
                </div>
                <div>
                  <dt>描述</dt>
                  <dd id="watermark-desc">-</dd>
                </div>
                <div>
                  <dt>类型</dt>
                  <dd id="watermark-type">-</dd>
                </div>
                <div>
                  <dt>平台</dt>
                  <dd id="watermark-platform">-</dd>
                </div>
                <div class="watermark-link-row">
                  <dt>地址</dt>
                  <dd><a id="watermark-link" href="#" target="_blank" rel="noopener">-</a></dd>
                </div>
              </dl>
              <div class="watermark-actions">
                <button class="primary-button" id="watermark-save-button" type="button">保存到本地</button>
                <button class="secondary-button" id="watermark-copy-button" type="button">复制地址</button>
              </div>
            </div>
          </div>

          <div class="result" id="watermark-result" hidden>
            <div class="result-copy">
              <span class="success-icon">✓</span>
              <div>
                <strong>已完成</strong>
                <span id="watermark-result-detail"></span>
              </div>
            </div>
            <button class="download-button" id="watermark-reveal-button" type="button">查看文件</button>
          </div>
          <p class="error-message" id="watermark-error" role="alert"></p>
        </div>
      </section>

      <section class="tool-page" id="archive-page" hidden>
        <header>
          <div>
            <p class="eyebrow">文件工具</p>
            <h1>文件解压</h1>
            <p class="subtitle">快速解压常见压缩包，文件不会上传到网络。</p>
          </div>
        </header>

        <div class="panel">
          <label class="drop-zone archive-drop-zone" id="archive-drop-zone" for="archive-input">
            <input
              id="archive-input"
              type="file"
              accept=".zip,.rar,.7z,.tar,.gz,.tgz,.bz2,.tbz2,.xz,.txz,.cab"
              hidden
            />
            <span class="upload-icon archive-icon">⇲</span>
            <strong>拖拽压缩包到这里，或点击选择</strong>
            <span>支持 ZIP、RAR、7z、tar、gz、bz2、xz、cab</span>
          </label>

          <div class="archive-editor" id="archive-editor" hidden>
            <div class="archive-file-card">
              <span class="archive-file-icon">ZIP</span>
              <div class="archive-file-copy">
                <strong id="archive-name"></strong>
                <span id="archive-meta"></span>
              </div>
              <button class="text-button" id="archive-replace-button" type="button">重新选择</button>
            </div>

            <div class="archive-settings-card">
              <h2>解压设置</h2>
              <label class="field">
                <span>保存位置</span>
                <button class="path-selector" id="destination-button" type="button">
                  <span id="destination-path"></span>
                  <span>选择…</span>
                </button>
              </label>
              <label class="field">
                <span>压缩包密码 <em>（可选）</em></span>
                <input
                  class="password-input"
                  id="archive-password"
                  type="password"
                  placeholder="加密压缩包请输入密码"
                  autocomplete="off"
                />
              </label>
              <p class="field-hint">内容会解压到同名的新文件夹；若已存在，将自动添加序号。</p>
              <button class="primary-button" id="extract-button" type="button">开始解压</button>
            </div>
          </div>

          <div class="result" id="archive-result" hidden>
            <div class="result-copy">
              <span class="success-icon">✓</span>
              <div>
                <strong>解压完成</strong>
                <span id="archive-result-detail"></span>
              </div>
            </div>
            <button class="download-button" id="open-folder-button" type="button">打开文件夹</button>
          </div>
          <p class="error-message" id="archive-error" role="alert"></p>
        </div>
      </section>

      <section class="tool-page" id="pdf-page" hidden>
        <header>
          <div>
            <p class="eyebrow">文档工具</p>
            <h1>PDF 工具箱</h1>
            <p class="subtitle">本地完成 PDF 合并、拆分、转图片、压缩和图片转 PDF，不上传文件。</p>
          </div>
        </header>

        <div class="panel pdf-panel">
          <div class="pdf-tabs">
            <button class="pdf-tab active" data-tab="merge" type="button">PDF 合并</button>
            <button class="pdf-tab" data-tab="split" type="button">PDF 拆分</button>
            <button class="pdf-tab" data-tab="image" type="button">图片转 PDF</button>
            <button class="pdf-tab" data-tab="export" type="button">PDF 转图片</button>
            <button class="pdf-tab" data-tab="compress" type="button">PDF 压缩</button>
            <button class="pdf-tab" data-tab="extract" type="button">提取图片</button>
            <button class="pdf-tab" data-tab="watermark" type="button">加水印</button>
          </div>

          <section class="pdf-pane" data-tab="merge">
            <div class="pdf-tool-layout">
              <div class="pdf-drop-card">
                <input id="pdf-merge-input" type="file" accept="application/pdf,.pdf" multiple hidden />
                <button class="secondary-button" id="pdf-merge-pick" type="button">选择多个 PDF</button>
                <p class="field-hint">按选择顺序合并；建议先在系统文件选择器里排好顺序。</p>
                <div class="source-list pdf-file-list" id="pdf-merge-list"></div>
                <div class="source-summary" id="pdf-merge-summary">请先选择 PDF 文件</div>
              </div>
              <div class="archive-settings-card">
                <h2>合并输出</h2>
                <p class="field-hint">将多个 PDF 合并为一个新文件，原文件不会被修改。</p>
                <button class="primary-button" id="pdf-merge-button" type="button">合并为一个 PDF</button>
                <p class="error-message" id="pdf-merge-error" role="alert"></p>
                <div class="result" id="pdf-merge-result" hidden></div>
              </div>
            </div>
          </section>

          <section class="pdf-pane" data-tab="split" hidden>
            <div class="pdf-tool-layout">
              <div class="pdf-drop-card">
                <input id="pdf-split-input" type="file" accept="application/pdf,.pdf" hidden />
                <button class="secondary-button" id="pdf-split-pick" type="button">选择一个 PDF</button>
                <p class="field-hint">支持输入 1-3,4,7-9 这种格式，逗号分隔多个范围。</p>
                <div id="pdf-split-info"></div>
              </div>
              <div class="archive-settings-card">
                <h2>拆分设置</h2>
                <label class="field">
                  <span>页码范围</span>
                  <input class="password-input" id="pdf-split-ranges" type="text" placeholder="例如：1-3,4,7-9" />
                </label>
                <button class="primary-button" id="pdf-split-button" type="button">按页码拆分</button>
                <p class="error-message" id="pdf-split-error" role="alert"></p>
                <div class="result" id="pdf-split-result" hidden></div>
              </div>
            </div>
          </section>

          <section class="pdf-pane" data-tab="image" hidden>
            <div class="pdf-tool-layout">
              <div class="pdf-drop-card">
                <input
                  id="image-pdf-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
                  multiple
                  hidden
                />
                <button class="secondary-button" id="image-pdf-pick" type="button">选择多张图片</button>
                <p class="field-hint">支持 JPG、PNG、WebP、AVIF；会按选择顺序生成 PDF 页面。</p>
                <div class="source-list pdf-file-list" id="image-pdf-list"></div>
                <div class="source-summary" id="image-pdf-summary">请先选择图片</div>
              </div>
              <div class="archive-settings-card">
                <h2>输出 PDF</h2>
                <p class="field-hint">会保留每张图的原始宽高，每张图对应一页 PDF。</p>
                <button class="primary-button" id="image-pdf-button" type="button">生成 PDF</button>
                <p class="error-message" id="image-pdf-error" role="alert"></p>
                <div class="result" id="image-pdf-result" hidden></div>
              </div>
            </div>
          </section>

          <section class="pdf-pane" data-tab="export" hidden>
            <div class="pdf-tool-layout">
              <div class="pdf-drop-card">
                <input id="pdf-export-input" type="file" accept="application/pdf,.pdf" hidden />
                <button class="secondary-button" id="pdf-export-pick" type="button">选择一个 PDF</button>
                <p class="field-hint">适合把文档页面导出成图片，便于发送、标注或做演示素材。</p>
                <div id="pdf-export-info"></div>
              </div>
              <div class="archive-settings-card">
                <h2>导出设置</h2>
                <label class="field">
                  <span>图片格式</span>
                  <select id="pdf-export-format">
                    <option value="png">PNG（更清晰）</option>
                    <option value="jpeg">JPG（体积更小）</option>
                  </select>
                </label>
                <button class="primary-button" id="pdf-export-button" type="button">导出页面为图片</button>
                <p class="error-message" id="pdf-export-error" role="alert"></p>
                <div class="result" id="pdf-export-result" hidden></div>
              </div>
            </div>
          </section>

          <section class="pdf-pane" data-tab="compress" hidden>
            <div class="pdf-tool-layout">
              <div class="pdf-drop-card">
                <input id="pdf-compress-input" type="file" accept="application/pdf,.pdf" hidden />
                <button class="secondary-button" id="pdf-compress-pick" type="button">选择一个 PDF</button>
                <p class="field-hint">更适合扫描件、图片型 PDF；会重建页面以减小体积，清晰度会随压缩等级变化。</p>
                <div id="pdf-compress-info"></div>
              </div>
              <div class="archive-settings-card">
                <h2>压缩设置</h2>
                <label class="field">
                  <span>压缩等级</span>
                  <select id="pdf-compress-quality">
                    <option value="small">更小体积</option>
                    <option value="balanced" selected>均衡</option>
                    <option value="clear">更清晰</option>
                  </select>
                </label>
                <p class="field-hint">说明：文字型/矢量型 PDF 不一定变小，扫描件通常效果更明显。</p>
                <button class="primary-button" id="pdf-compress-button" type="button">压缩 PDF</button>
                <p class="error-message" id="pdf-compress-error" role="alert"></p>
                <div class="result" id="pdf-compress-result" hidden></div>
              </div>
            </div>
          </section>

          <section class="pdf-pane" data-tab="extract" hidden>
            <div class="pdf-tool-layout">
              <div class="pdf-drop-card">
                <input id="pdf-extract-input" type="file" accept="application/pdf,.pdf" hidden />
                <button class="secondary-button" id="pdf-extract-pick" type="button">选择一个 PDF</button>
                <p class="field-hint">提取 PDF 内嵌的图片资源；如果文档主要是文字/矢量内容，可能提取不到图片。</p>
                <div id="pdf-extract-info"></div>
              </div>
              <div class="archive-settings-card">
                <h2>提取设置</h2>
                <p class="field-hint">输出为 PNG 文件，按页码和图片顺序命名。</p>
                <button class="primary-button" id="pdf-extract-button" type="button">提取图片</button>
                <p class="error-message" id="pdf-extract-error" role="alert"></p>
                <div class="result" id="pdf-extract-result" hidden></div>
              </div>
            </div>
          </section>

          <section class="pdf-pane" data-tab="watermark" hidden>
            <div class="pdf-tool-layout">
              <div class="pdf-drop-card">
                <input id="pdf-watermark-input" type="file" accept="application/pdf,.pdf" hidden />
                <button class="secondary-button" id="pdf-watermark-pick" type="button">选择一个 PDF</button>
                <p class="field-hint">为每一页添加居中斜向文字水印，适合标注“内部资料”“仅供预览”等。</p>
                <div id="pdf-watermark-info"></div>
              </div>
              <div class="archive-settings-card">
                <h2>水印设置</h2>
                <label class="field">
                  <span>水印文字</span>
                  <input class="password-input" id="pdf-watermark-text" type="text" placeholder="例如：内部资料 / 仅供预览" />
                </label>
                <label class="field">
                  <span>透明度</span>
                  <select id="pdf-watermark-opacity">
                    <option value="0.12">淡</option>
                    <option value="0.18" selected>中</option>
                    <option value="0.28">明显</option>
                  </select>
                </label>
                <button class="primary-button" id="pdf-watermark-button" type="button">生成带水印 PDF</button>
                <p class="error-message" id="pdf-watermark-error" role="alert"></p>
                <div class="result" id="pdf-watermark-result" hidden></div>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section class="tool-page" id="compression-page" hidden>
        <header>
          <div>
            <p class="eyebrow">文件工具</p>
            <h1>文件压缩</h1>
            <p class="subtitle">将多个文件或整个文件夹压缩为一个归档文件。</p>
          </div>
        </header>

        <div class="panel">
          <div class="drop-zone archive-drop-zone" id="compression-drop-zone">
            <span class="upload-icon archive-icon">⇱</span>
            <strong>拖拽文件或文件夹到这里</strong>
            <span>支持压缩为 ZIP、7z、tar.gz</span>
            <div class="drop-zone-actions">
              <button class="secondary-button" id="choose-files-button" type="button">选择文件</button>
              <button class="secondary-button" id="choose-folder-button" type="button">选择文件夹</button>
            </div>
          </div>

          <div class="compression-editor" id="compression-editor" hidden>
            <div class="compression-source-card">
              <div class="preview-heading">
                <span>待压缩内容</span>
                <button class="text-button" id="compression-replace-button" type="button">重新选择</button>
              </div>
              <div class="source-list" id="compression-source-list"></div>
              <div class="source-summary" id="compression-source-summary"></div>
            </div>

            <div class="archive-settings-card">
              <h2>压缩设置</h2>
              <label class="field">
                <span>压缩格式</span>
                <select id="archive-format">
                  <option value="zip">ZIP（通用兼容）</option>
                  <option value="7z">7z（压缩率更高）</option>
                  <option value="tar.gz">tar.gz（开发常用）</option>
                </select>
              </label>
              <label class="field">
                <span>文件名称</span>
                <input class="password-input" id="compression-name" type="text" />
              </label>
              <label class="field">
                <span>保存位置</span>
                <button class="path-selector" id="compression-destination-button" type="button">
                  <span id="compression-destination-path"></span>
                  <span>选择…</span>
                </button>
              </label>
              <label class="field" id="compression-password-field">
                <span>压缩密码 <em>（可选）</em></span>
                <input
                  class="password-input"
                  id="compression-password"
                  type="password"
                  placeholder="设置打开压缩包所需的密码"
                  autocomplete="new-password"
                />
              </label>
              <p class="field-hint" id="compression-format-hint">
                ZIP 兼容性最好；设置密码后使用 AES-256 加密。
              </p>
              <button class="primary-button" id="create-archive-button" type="button">开始压缩</button>
            </div>
          </div>

          <div class="result" id="compression-result" hidden>
            <div class="result-copy">
              <span class="success-icon">✓</span>
              <div>
                <strong>压缩完成</strong>
                <span id="compression-result-detail"></span>
              </div>
            </div>
            <button class="download-button" id="show-archive-button" type="button">查看文件</button>
          </div>
          <p class="error-message" id="compression-error" role="alert"></p>
        </div>
      </section>

      <section class="tool-page" id="disk-clean-page" hidden>
        <header>
          <div>
            <p class="eyebrow">系统工具</p>
            <h1>磁盘瘦身</h1>
            <p class="subtitle">扫描并清理系统缓存、临时文件、垃圾文件，安全释放磁盘空间。</p>
          </div>
          <button class="primary-button dc-scan-top-btn" id="dc-scan-btn" type="button">开始扫描</button>
        </header>
        <div class="panel">
          <p class="sysinfo-loading" id="dc-spinner" hidden>正在扫描，请稍候…</p>

          <div class="dc-summary-bar" id="dc-summary-bar">
            <span id="dc-summary"></span>
            <div class="dc-toolbar">
              <button class="text-button" id="dc-select-all" type="button">全选</button>
              <button class="text-button" id="dc-deselect-all" type="button">取消全选</button>
            </div>
          </div>

          <div class="dc-list" id="dc-list"></div>

          <div class="dc-footer">
            <span class="dc-sel-summary" id="dc-sel-summary">请先扫描</span>
            <button class="primary-button" id="dc-clean-btn" type="button" hidden disabled>开始清理</button>
          </div>

          <div class="result dc-result-banner" id="dc-result-banner" hidden></div>
          <p class="error-message" id="dc-error" role="alert"></p>
        </div>
      </section>

      <section class="tool-page" id="sysinfo-page" hidden>
        <header>
          <div>
            <p class="eyebrow">系统工具</p>
            <h1>电脑信息</h1>
            <p class="subtitle">查看本机硬件配置与存储使用情况。</p>
          </div>
          <button class="secondary-button sysinfo-refresh-btn" id="sysinfo-refresh" type="button">刷新</button>
        </header>
        <div class="panel">
          <p class="sysinfo-loading" id="sysinfo-loading" hidden>正在读取系统信息…</p>
          <div id="sysinfo-container"></div>
        </div>
      </section>
      <section class="tool-page tool-page--chat" id="pet-chat-page" hidden>
        <div class="pet-chat-shell" id="pet-chat-root">
          <header class="pet-chat-status-strip">
            <div class="pet-chat-status-main">
              <span class="pet-chat-status-label">宠物信息</span>
              <span class="pet-chat-status-text" id="pet-chat-status">读取状态中…</span>
            </div>
            <div class="pet-chat-status-actions">
              <div class="pet-chat-model-chip" id="pet-ai-model-chip">
                <span class="pet-chat-model-name">DeepSeek</span>
                <span class="pet-chat-model-meta" id="pet-ai-model-meta">deepseek-v4-flash</span>
              </div>
              <button class="text-button pet-chat-clear-btn" id="pet-chat-clear-history" type="button">新对话</button>
              <button
                class="pet-chat-icon-btn"
                id="pet-ai-settings-toggle"
                type="button"
                aria-expanded="false"
                aria-label="API 设置"
                title="API 设置"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.07 7.07 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.6.24-1.14.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.24l2.39-.96c.49.39 1.03.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.6-.24 1.14-.55 1.63-.94l2.39.96c.25.1.54 0 .68-.24l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
                  />
                </svg>
              </button>
            </div>
          </header>

          <section class="pet-chat-settings" id="pet-ai-settings" hidden>
            <div class="pet-chat-settings-inner">
              <div class="pet-chat-settings-head">
                <strong>API 设置</strong>
                <span id="pet-ai-key-hint">尚未配置 API Key</span>
              </div>
              <label class="field pet-chat-settings-field">
                <span>模型</span>
                <input type="text" value="deepseek-v4-flash（经济档）" readonly />
              </label>
              <p class="field-hint">
                Key 仅保存在本机。可在
                <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">DeepSeek 开放平台</a>
                申请。
              </p>
              <div class="pet-chat-config-row">
                <input
                  class="password-input"
                  id="pet-ai-api-key"
                  type="password"
                  placeholder="粘贴 DeepSeek API Key"
                  autocomplete="off"
                />
                <button class="secondary-button" id="pet-ai-save-key" type="button">保存</button>
                <button class="text-button" id="pet-ai-clear-key" type="button">清除</button>
              </div>
            </div>
          </section>

          <div class="pet-chat-messages" id="pet-chat-messages" aria-live="polite"></div>

          <footer class="pet-chat-composer">
            <p class="error-message" id="pet-chat-error" role="alert"></p>
            <div class="pet-chat-input-shell">
              <textarea
                id="pet-chat-input"
                rows="1"
                placeholder="给宠物发送消息…"
              ></textarea>
              <button class="pet-chat-send-btn" id="pet-chat-send" type="button" aria-label="发送">↑</button>
            </div>
            <p class="pet-chat-composer-hint">Enter 发送 · Shift+Enter 换行</p>
          </footer>
        </div>
      </section>

      <section class="tool-page" id="pet-settings-page">
        <header>
          <div>
            <p class="eyebrow">MY PET</p>
            <h1>宠物设置</h1>
            <p class="subtitle">在左侧选择分类，右侧查看与修改对应设置。</p>
          </div>
        </header>
        <div class="panel" id="pet-settings-root"></div>
      </section>
    </main>
  </div>
`

const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const dropZone = document.querySelector<HTMLElement>('#drop-zone')!
const editor = document.querySelector<HTMLElement>('#editor')!
const preview = document.querySelector<HTMLImageElement>('#preview')!
const fileName = document.querySelector<HTMLElement>('#file-name')!
const fileInfo = document.querySelector<HTMLElement>('#file-info')!
const originalSize = document.querySelector<HTMLElement>('#original-size')!
const format = document.querySelector<HTMLSelectElement>('#format')!
const compressButton = document.querySelector<HTMLButtonElement>('#compress-button')!
const result = document.querySelector<HTMLElement>('#result')!
const resultDetail = document.querySelector<HTMLElement>('#result-detail')!
const downloadButton = document.querySelector<HTMLButtonElement>('#download-button')!
const replaceButton = document.querySelector<HTMLButtonElement>('#replace-button')!
const errorMessage = document.querySelector<HTMLElement>('#error-message')!

let sourceFile: File | null = null
let sourceUrl: string | null = null
let compressedUrl: string | null = null
let compressedExtension = 'webp'

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const resetResult = () => {
  result.hidden = true
  errorMessage.textContent = ''
  if (compressedUrl) {
    if (sourceUrl) preview.src = sourceUrl
    URL.revokeObjectURL(compressedUrl)
    compressedUrl = null
  }
}

const readImageDimensions = (url: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = url
  })

async function selectFile(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
    errorMessage.textContent = '请选择 JPG、PNG、WebP 或 AVIF 格式的图片。'
    return
  }

  resetResult()
  if (sourceUrl) URL.revokeObjectURL(sourceUrl)
  sourceFile = file
  sourceUrl = URL.createObjectURL(file)

  try {
    const dimensions = await readImageDimensions(sourceUrl)
    preview.src = sourceUrl
    fileName.textContent = file.name
    fileInfo.textContent = `${dimensions.width} × ${dimensions.height} px`
    originalSize.textContent = formatBytes(file.size)
    dropZone.hidden = true
    editor.hidden = false
  } catch {
    errorMessage.textContent = '无法读取这张图片，请尝试其他文件。'
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void selectFile(file)
})

replaceButton.addEventListener('click', () => fileInput.click())
format.addEventListener('change', resetResult)

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    dropZone.classList.add('dragging')
  })
}

for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    dropZone.classList.remove('dragging')
  })
}

dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files[0]
  if (file) void selectFile(file)
})

compressButton.addEventListener('click', async () => {
  if (!sourceFile || !sourceUrl) return

  compressButton.disabled = true
  compressButton.textContent = '正在压缩…'
  resetResult()

  try {
    const buffer = await sourceFile.arrayBuffer()
    const output = await window.electronAPI.compressImage({
      data: new Uint8Array(buffer),
      format: format.value as CompressRequest['format'],
    })

    compressedExtension = output.extension
    const bytes = new Uint8Array(output.data)
    compressedUrl = URL.createObjectURL(
      new Blob([bytes.buffer as ArrayBuffer], { type: output.format }),
    )
    preview.src = compressedUrl

    const percent = Math.round(((sourceFile.size - output.size) / sourceFile.size) * 100)
    resultDetail.textContent = output.keptOriginal
      ? `原图已足够小（${formatBytes(sourceFile.size)}），已保留原图；可尝试输出为 WebP`
      : `体积由 ${formatBytes(sourceFile.size)} 减至 ${formatBytes(output.size)}，节省 ${percent}%（${output.strategy}）`
    result.hidden = false
  } catch {
    errorMessage.textContent = '压缩失败，请更换图片或调整设置后重试。'
  } finally {
    compressButton.disabled = false
    compressButton.textContent = '开始压缩'
  }
})

downloadButton.addEventListener('click', () => {
  if (!compressedUrl || !sourceFile) return
  const baseName = sourceFile.name.replace(/\.[^.]+$/, '')
  const link = document.createElement('a')
  link.href = compressedUrl
  link.download = `${baseName}-compressed.${compressedExtension}`
  link.click()
})

const compressionDropZone = document.querySelector<HTMLElement>('#compression-drop-zone')!
const compressionEditor = document.querySelector<HTMLElement>('#compression-editor')!
const chooseFilesButton = document.querySelector<HTMLButtonElement>('#choose-files-button')!
const chooseFolderButton = document.querySelector<HTMLButtonElement>('#choose-folder-button')!
const compressionReplaceButton =
  document.querySelector<HTMLButtonElement>('#compression-replace-button')!
const compressionSourceList = document.querySelector<HTMLElement>('#compression-source-list')!
const compressionSourceSummary =
  document.querySelector<HTMLElement>('#compression-source-summary')!
const archiveFormat = document.querySelector<HTMLSelectElement>('#archive-format')!
const compressionName = document.querySelector<HTMLInputElement>('#compression-name')!
const compressionDestinationButton =
  document.querySelector<HTMLButtonElement>('#compression-destination-button')!
const compressionDestinationPath =
  document.querySelector<HTMLElement>('#compression-destination-path')!
const compressionPasswordField =
  document.querySelector<HTMLElement>('#compression-password-field')!
const compressionPassword =
  document.querySelector<HTMLInputElement>('#compression-password')!
const compressionFormatHint =
  document.querySelector<HTMLElement>('#compression-format-hint')!
const createArchiveButton =
  document.querySelector<HTMLButtonElement>('#create-archive-button')!
const compressionResult = document.querySelector<HTMLElement>('#compression-result')!
const compressionResultDetail =
  document.querySelector<HTMLElement>('#compression-result-detail')!
const showArchiveButton = document.querySelector<HTMLButtonElement>('#show-archive-button')!
const compressionError = document.querySelector<HTMLElement>('#compression-error')!

let compressionSources: CompressionSource[] = []
let compressionDestination = ''
let createdArchivePath = ''

const resetCompressionResult = () => {
  compressionResult.hidden = true
  compressionError.textContent = ''
  createdArchivePath = ''
}

const renderCompressionSources = (sources: CompressionSource[]) => {
  if (sources.length === 0) return
  const firstDirectory = sources[0].defaultDestination
  if (sources.some((source) => source.defaultDestination !== firstDirectory)) {
    compressionError.textContent = '一次压缩的文件需要位于同一目录。'
    return
  }

  compressionSources = sources
  compressionDestination = firstDirectory
  compressionDestinationPath.textContent = firstDirectory
  compressionName.value = sources.length === 1
    ? sources[0].isDirectory
      ? sources[0].name
      : sources[0].name.replace(/\.[^.]+$/, '') || sources[0].name
    : '压缩文件'
  compressionSourceList.innerHTML = sources.map((source) => `
    <div class="source-item">
      <span class="source-item-icon">${source.isDirectory ? '▣' : '▤'}</span>
      <div>
        <strong>${escapeHtml(source.name)}</strong>
        <span>${source.isDirectory ? '文件夹' : formatBytes(source.size)}</span>
      </div>
    </div>
  `).join('')
  const totalSize = sources.reduce((total, source) => total + source.size, 0)
  compressionSourceSummary.textContent =
    `共 ${sources.length} 项 · ${formatBytes(totalSize)}`
  compressionDropZone.hidden = true
  compressionEditor.hidden = false
  resetCompressionResult()
}

function escapeHtml(value: string) {
  const element = document.createElement('span')
  element.textContent = value
  return element.innerHTML
}

const inspectCompressionFiles = async (files: File[]) => {
  try {
    const sources = await Promise.all(files.map((file) => {
      const filePath = window.electronAPI.getPathForFile(file)
      if (!filePath) throw new Error('无法读取文件路径')
      return window.electronAPI.inspectCompressionSource(filePath)
    }))
    renderCompressionSources(sources)
  } catch {
    compressionError.textContent = '无法读取所选文件，请重新选择。'
  }
}

// 走主进程的原生对话框，因为 <input type="file"> 无法选中文件夹。
const pickSources = async (mode: 'files' | 'directory') => {
  try {
    const sources = await window.electronAPI.chooseCompressionSources(mode)
    if (sources.length > 0) renderCompressionSources(sources)
  } catch {
    compressionError.textContent = '无法读取所选内容，请重新选择。'
  }
}

chooseFilesButton.addEventListener('click', () => void pickSources('files'))
chooseFolderButton.addEventListener('click', () => void pickSources('directory'))

compressionReplaceButton.addEventListener('click', () => {
  compressionSources = []
  compressionEditor.hidden = true
  compressionDropZone.hidden = false
  resetCompressionResult()
})

for (const eventName of ['dragenter', 'dragover']) {
  compressionDropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    compressionDropZone.classList.add('dragging')
  })
}

for (const eventName of ['dragleave', 'drop']) {
  compressionDropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    compressionDropZone.classList.remove('dragging')
  })
}

compressionDropZone.addEventListener('drop', (event) => {
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length > 0) void inspectCompressionFiles(files)
})

compressionDestinationButton.addEventListener('click', async () => {
  const selected = await window.electronAPI.chooseDestination(compressionDestination)
  if (selected) {
    compressionDestination = selected
    compressionDestinationPath.textContent = selected
    resetCompressionResult()
  }
})

archiveFormat.addEventListener('change', () => {
  const isTarGz = archiveFormat.value === 'tar.gz'
  compressionPasswordField.hidden = isTarGz
  if (isTarGz) compressionPassword.value = ''
  compressionFormatHint.textContent = isTarGz
    ? 'tar.gz 适合开发与类 Unix 环境，不支持密码加密。'
    : archiveFormat.value === '7z'
      ? '7z 使用 LZMA2 算法，通常压缩率更高。'
      : 'ZIP 兼容性最好；设置密码后使用 AES-256 加密。'
  resetCompressionResult()
})

createArchiveButton.addEventListener('click', async () => {
  if (compressionSources.length === 0) return
  if (!compressionName.value.trim()) {
    compressionError.textContent = '请输入压缩文件名称。'
    return
  }

  createArchiveButton.disabled = true
  createArchiveButton.textContent = '正在压缩…'
  resetCompressionResult()

  try {
    const output = await window.electronAPI.compressArchive({
      sources: compressionSources.map((source) => source.path),
      destinationRoot: compressionDestination,
      outputName: compressionName.value,
      format: archiveFormat.value as 'zip' | '7z' | 'tar.gz',
      password: compressionPassword.value || undefined,
    })
    createdArchivePath = output.outputPath
    compressionResultDetail.textContent =
      `${output.sourceCount} 项，${formatBytes(output.inputSize)} → ${formatBytes(output.outputSize)}`
    compressionResult.hidden = false
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    compressionError.textContent = message.includes('同一目录')
      ? '一次压缩的文件需要位于同一目录。'
      : '压缩失败，请检查文件权限或更换保存位置。'
  } finally {
    createArchiveButton.disabled = false
    createArchiveButton.textContent = '开始压缩'
  }
})

showArchiveButton.addEventListener('click', () => {
  if (createdArchivePath) void window.electronAPI.revealPath(createdArchivePath)
})

const archiveInput = document.querySelector<HTMLInputElement>('#archive-input')!
const archiveDropZone = document.querySelector<HTMLElement>('#archive-drop-zone')!
const archiveEditor = document.querySelector<HTMLElement>('#archive-editor')!
const archiveName = document.querySelector<HTMLElement>('#archive-name')!
const archiveMeta = document.querySelector<HTMLElement>('#archive-meta')!
const archiveFileIcon = document.querySelector<HTMLElement>('.archive-file-icon')!
const archiveReplaceButton =
  document.querySelector<HTMLButtonElement>('#archive-replace-button')!
const destinationButton = document.querySelector<HTMLButtonElement>('#destination-button')!
const destinationPath = document.querySelector<HTMLElement>('#destination-path')!
const archivePassword = document.querySelector<HTMLInputElement>('#archive-password')!
const extractButton = document.querySelector<HTMLButtonElement>('#extract-button')!
const archiveResult = document.querySelector<HTMLElement>('#archive-result')!
const archiveResultDetail = document.querySelector<HTMLElement>('#archive-result-detail')!
const openFolderButton = document.querySelector<HTMLButtonElement>('#open-folder-button')!
const archiveError = document.querySelector<HTMLElement>('#archive-error')!

let selectedArchive: ArchiveInfo | null = null
let selectedDestination = ''
let extractedPath = ''

const resetArchiveResult = () => {
  archiveResult.hidden = true
  archiveError.textContent = ''
  extractedPath = ''
}

const displayArchive = (archive: ArchiveInfo) => {
  selectedArchive = archive
  selectedDestination = archive.defaultDestination
  archiveName.textContent = archive.name
  archiveMeta.textContent = `${archive.format} · ${formatBytes(archive.size)}`
  archiveFileIcon.textContent = archive.format.slice(0, 4)
  destinationPath.textContent = selectedDestination
  archiveDropZone.hidden = true
  archiveEditor.hidden = false
  archivePassword.value = ''
  resetArchiveResult()
}

const inspectArchiveFile = async (file: File) => {
  try {
    const filePath = window.electronAPI.getPathForFile(file)
    if (!filePath) throw new Error('无法读取文件路径')
    displayArchive(await window.electronAPI.inspectArchive(filePath))
  } catch (error) {
    archiveError.textContent = error instanceof Error && error.message.includes('不支持')
      ? '不支持该压缩包格式。'
      : '无法读取该压缩包，请重新选择。'
  }
}

archiveInput.addEventListener('change', () => {
  const file = archiveInput.files?.[0]
  if (file) void inspectArchiveFile(file)
})

archiveReplaceButton.addEventListener('click', () => archiveInput.click())

for (const eventName of ['dragenter', 'dragover']) {
  archiveDropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    archiveDropZone.classList.add('dragging')
  })
}

for (const eventName of ['dragleave', 'drop']) {
  archiveDropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    archiveDropZone.classList.remove('dragging')
  })
}

archiveDropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files[0]
  if (file) void inspectArchiveFile(file)
})

destinationButton.addEventListener('click', async () => {
  const selected = await window.electronAPI.chooseDestination(selectedDestination)
  if (selected) {
    selectedDestination = selected
    destinationPath.textContent = selected
    resetArchiveResult()
  }
})

extractButton.addEventListener('click', async () => {
  if (!selectedArchive) return

  extractButton.disabled = true
  extractButton.textContent = '正在解压…'
  resetArchiveResult()

  try {
    const output = await window.electronAPI.extractArchive({
      archivePath: selectedArchive.path,
      destinationRoot: selectedDestination,
      password: archivePassword.value || undefined,
    })
    extractedPath = output.outputPath
    archiveResultDetail.textContent =
      `已解压 ${output.fileCount} 个文件到 ${output.outputPath}`
    archiveResult.hidden = false
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('密码')) {
      archiveError.textContent = '密码错误、缺少密码，或压缩包已损坏。'
    } else if (message.includes('不安全')) {
      archiveError.textContent = '压缩包包含不安全路径，已阻止解压。'
    } else {
      archiveError.textContent = '解压失败，压缩包可能已损坏或格式不受支持。'
    }
  } finally {
    extractButton.disabled = false
    extractButton.textContent = '开始解压'
  }
})

openFolderButton.addEventListener('click', () => {
  if (extractedPath) void window.electronAPI.openPath(extractedPath)
})

window.addEventListener('beforeunload', () => {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl)
  if (compressedUrl) URL.revokeObjectURL(compressedUrl)
})

mountWatermarkPage()
mountSystemInfoPage()
mountDiskCleanPage()
mountPdfPage()
mountPetSettingsPage()
mountPetChatPage()
setupAppNavigation()

document.querySelector<HTMLButtonElement>('#open-pet-chat')?.addEventListener('click', () => {
  navigateToPage('pet-chat-page')
})
