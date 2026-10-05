import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  List,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import {
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  StopOutlined,
  ToolOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { chatApi, multimodalApi, providerCatalogApi } from '../services/api'
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatDebugTrace,
  ChatMessage,
  ChatSession,
  ChatSettings,
  ChatToolCall,
  ChatToolCallDelta,
  ComparisonResult,
  ComparisonRequest,
  ModelRead,
  TTSPluginInfo,
  TTSVoiceInfo,
} from '../services/types'
import { getProviderColor } from '../utils/providerColors'
import { getTagIcon } from '../utils/tagIcons'

const { Text, Title } = Typography
const { TextArea } = Input

const STORAGE_KEY = 'llm-router-chat-sessions-v1'

const TEMPLATE_OPTIONS = [
  {
    value: 'balanced',
    label: '平衡',
    settings: { temperature: 0.7, topP: 1, maxTokens: 1024 },
  },
  {
    value: 'precise',
    label: '精确',
    settings: { temperature: 0.2, topP: 1, maxTokens: 1024 },
  },
  {
    value: 'creative',
    label: '创意',
    settings: { temperature: 1, topP: 1, maxTokens: 1536 },
  },
] as const

interface PendingImage {
  uid: string
  name: string
  dataUrl: string
}

/** Tags that render as capability icons instead of text pills. */
const CAPABILITY_ICON_TAGS = new Set([
  'image', 'audio', 'video', 'reasoning', 'function-call',
  'web-search', 'agentic', 'free', 'code-execution', 'mcp', 'document',
])

const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const parsePluginTTSModel = (model: string): { pluginName: string; modelId: string } | null => {
  if (!model.startsWith('plugin:')) {
    return null
  }
  const rest = model.slice('plugin:'.length)
  const [pluginName, modelId] = rest.split('/', 2)
  if (!pluginName || !modelId) {
    return null
  }
  return { pluginName, modelId }
}

const formatVoiceLabel = (voice: TTSVoiceInfo) => {
  const baseName =
    voice.display_name?.trim() ||
    [voice.character_display_name?.trim(), voice.timbre_display_name?.trim()].filter(Boolean).join(' / ') ||
    voice.id
  const name = baseName
  if (voice.downloading) {
    return `${name}（下载中）`
  }
  if (voice.downloaded) {
    return `${name}（已下载）`
  }
  if (voice.error) {
    return `${name}（状态异常）`
  }
  return `${name}（首次使用自动下载）`
}

const extractAssistantOutput = (response: ChatCompletionResponse): { content: string; toolCalls: ChatToolCall[] } => {
  const choice = response.choices?.[0]
  const content = choice?.message?.content ?? ''
  const toolCalls = (choice?.message?.tool_calls ?? []).map((toolCall, index) => ({
    id: toolCall.id ?? generateId(),
    index,
    type: toolCall.type ?? 'function',
    name: toolCall.function?.name ?? 'unknown_tool',
    arguments: toolCall.function?.arguments ?? '',
  }))
  return { content, toolCalls }
}

const mergeToolCallDelta = (
  current: Record<number, ChatToolCall>,
  deltas: ChatToolCallDelta[]
): Record<number, ChatToolCall> => {
  const next = { ...current }
  for (const delta of deltas) {
    const existing = next[delta.index] ?? {
      id: delta.id ?? generateId(),
      index: delta.index,
      type: delta.type ?? 'function',
      name: delta.name ?? 'unknown_tool',
      arguments: '',
    }
    next[delta.index] = {
      ...existing,
      id: delta.id ?? existing.id,
      type: delta.type ?? existing.type,
      name: delta.name ?? existing.name,
      arguments: `${existing.arguments}${delta.argumentsPart ?? ''}`,
    }
  }
  return next
}

const createDefaultSettings = (model: string): ChatSettings => ({
  model,
  temperature: 0.7,
  maxTokens: 1024,
  topP: 1,
  stream: true,
  systemPrompt: '',
  thinkingEffort: '',
  toolsJson: '',
  skillsJson: '',
  toolChoiceJson: '',
  extraBodyJson: '',
})

const createSession = (model: string): ChatSession => {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    title: '新会话',
    createdAt: now,
    updatedAt: now,
    settings: createDefaultSettings(model),
    messages: [],
    traces: [],
  }
}

const inferTitleFromContent = (content: string) => {
  const text = content.trim().replace(/\s+/g, ' ')
  if (!text) {
    return '新会话'
  }
  return text.length > 24 ? `${text.slice(0, 24)}...` : text
}

const normalizeSessions = (sessions: ChatSession[]): ChatSession[] =>
  sessions.map((session) => ({
    ...session,
    settings: {
      ...session.settings,
      toolsJson: session.settings.toolsJson ?? '',
      skillsJson: session.settings.skillsJson ?? '',
      toolChoiceJson: session.settings.toolChoiceJson ?? '',
      thinkingEffort: session.settings.thinkingEffort ?? '',
      extraBodyJson: session.settings.extraBodyJson ?? '',
    },
    messages: Array.isArray(session.messages) ? session.messages : [],
    traces: Array.isArray(session.traces) ? session.traces : [],
  }))

const parseJson = (label: string, raw?: string): any => {
  const text = (raw || '').trim()
  if (!text) {
    return undefined
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label} 不是合法 JSON`) 
  }
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

interface MultimodalModelSelectProps {
  label: string
  models: ModelRead[]
  providers: { name: string; type: string; count: number }[]
  value: string
  onChange: (value: string) => void
  modelMap: Map<string, ModelRead>
  ttsPlugins?: TTSPluginInfo[]
}

const MultimodalModelSelect: React.FC<MultimodalModelSelectProps> = ({
  label,
  models,
  providers,
  value,
  onChange,
  modelMap,
  ttsPlugins,
}) => {
  const currentModel = modelMap.get(value)
  const currentProvider = currentModel?.provider_name

  const filteredProviders = providers.filter((p) => models.some((m) => m.provider_name === p.name))

  const filteredModels = useMemo(
    () => (currentProvider ? models.filter((m) => m.provider_name === currentProvider) : []),
    [currentProvider, models]
  )
  const filteredModelKeys = useMemo(
    () => filteredModels.map((m) => `${m.provider_name}/${m.name}`),
    [filteredModels]
  )

  const ttsPluginOptions = useMemo(
    () =>
      ttsPlugins
        ? ttsPlugins.flatMap((plugin) =>
            (plugin.models ?? []).map((modelId) => ({
              value: `plugin:${plugin.name}/${modelId}`,
              label: modelId,
              pluginName: plugin.name,
            }))
          )
        : [],
    [ttsPlugins]
  )

  const combinedOptions = useMemo(() => {
    const std = filteredModelKeys.map((k) => ({ value: k, label: k }))
    return [...std, ...ttsPluginOptions]
  }, [filteredModelKeys, ttsPluginOptions])

  const handleProviderChange = (providerName: string | undefined) => {
    if (!providerName) return
    const first = models.find((m) => m.provider_name === providerName)
    if (first) onChange(`${first.provider_name}/${first.name}`)
  }

  return (
    <Space direction="vertical" className="chat-full-width" size={4}>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <Select
        value={currentProvider || undefined}
        placeholder="选择供应商"
        showSearch
        filterOption={(input, opt) => {
          if (!opt?.value) return false
          return String(opt.value).toLowerCase().includes(input.toLowerCase())
        }}
        options={filteredProviders.map((p) => ({ value: p.name, label: p.name }))}
        onChange={handleProviderChange}
        className="chat-full-width"
        size="small"
        labelRender={(opt) => {
          const color = getProviderColor(String(opt.value))
          return (
            <span className="chat-model-select-label">
              <span className="chat-model-option-dot" style={{ backgroundColor: color }} />
              <span>{String(opt.value)}</span>
            </span>
          )
        }}
        optionRender={(opt) => {
          const color = getProviderColor(String(opt.value))
          return (
            <div className="chat-model-option">
              <span className="chat-model-option-dot" style={{ backgroundColor: color }} />
              <span className="chat-model-option-name">{String(opt.value)}</span>
            </div>
          )
        }}
      />
      <Select
        value={combinedOptions.some((o) => o.value === value) ? value : undefined}
        placeholder="选择模型"
        showSearch
        filterOption={(input, opt) => {
          if (!opt?.value) return false
          const val = String(opt.value)
          if (val.startsWith('plugin:')) {
            return val.toLowerCase().includes(input.toLowerCase())
          }
          const m = modelMap.get(val)
          if (!m) return false
          const q = input.toLowerCase()
          return (
            m.name.toLowerCase().includes(q) ||
            (m.display_name || '').toLowerCase().includes(q) ||
            m.tags?.some((t) => t.toLowerCase().includes(q))
          )
        }}
        options={combinedOptions}
        onChange={(v) => onChange(v)}
        className="chat-full-width"
        size="small"
        optionRender={(opt) => {
          const val = String(opt.value)
          if (val.startsWith('plugin:')) return <span>{val}</span>
          const m = modelMap.get(val)
          if (!m) return <span>{val}</span>
          const capTags = (m.tags ?? []).filter((t) => CAPABILITY_ICON_TAGS.has(t))
          const otherTags = (m.tags ?? []).filter((t) => !CAPABILITY_ICON_TAGS.has(t)).slice(0, 2)
          return (
            <div className="chat-model-option">
              <div className="chat-model-option-info">
                <span className="chat-model-option-name">{m.display_name || m.name}</span>
              </div>
              {capTags.length > 0 && (
                <span className="chat-model-option-cap-icons">
                  {capTags.map((tag) => {
                    const Icon = getTagIcon(tag)
                    return Icon ? <Icon key={tag} className="chat-model-option-cap-icon" /> : null
                  })}
                </span>
              )}
              {otherTags.length > 0 && (
                <span className="chat-model-option-tags">
                  {otherTags.map((tag) => (
                    <span key={tag} className="chat-model-option-tag">{tag}</span>
                  ))}
                </span>
              )}
            </div>
          )
        }}
      />
    </Space>
  )
}

const ChatWorkbench: React.FC = () => {
  const [models, setModels] = useState<ModelRead[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [ttsPlugins, setTTSPlugins] = useState<TTSPluginInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [activeTraceIndex, setActiveTraceIndex] = useState<number>(-1)
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered')
  const [templateKey, setTemplateKey] = useState<string>('balanced')
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [mmModel, setMmModel] = useState('openai/gpt-4.1')
  const [mmInput, setMmInput] = useState('')
  const [mmPrompt, setMmPrompt] = useState('')
  const [mmVoice, setMmVoice] = useState('alloy')
  const [mmVoices, setMmVoices] = useState<TTSVoiceInfo[]>([])
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [videoJobId, setVideoJobId] = useState('')
  const [mmResult, setMmResult] = useState<Record<string, any> | null>(null)
  const [mmLoading, setMmLoading] = useState(false)
  // Compare tab state
  const [compareModels, setCompareModels] = useState<string[]>([])
  const [compareSystemPrompt, setCompareSystemPrompt] = useState('')
  const [compareUserPrompt, setCompareUserPrompt] = useState('')
  const [compareTemperature, setCompareTemperature] = useState(0.7)
  const [compareMaxTokens, setCompareMaxTokens] = useState(1024)
  const [compareTopP, setCompareTopP] = useState(1)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareResults, setCompareResults] = useState<ComparisonResult[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let mounted = true
    setLoadingModels(true)
    Promise.all([chatApi.listActiveModels(), multimodalApi.listTTSPlugins().catch(() => [])])
      .then(([list, pluginList]) => {
        if (!mounted) {
          return
        }
        setModels(list)
        setTTSPlugins(pluginList)
      })
      .catch((error) => {
        console.error(error)
        message.error('加载模型列表失败')
      })
      .finally(() => {
        if (mounted) {
          setLoadingModels(false)
        }
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const parsed = parsePluginTTSModel(mmModel)
    if (!parsed) {
      setMmVoices([])
      setMmVoice('alloy')
      return
    }
    let mounted = true
    setLoadingVoices(true)
    multimodalApi
      .listTTSVoices(parsed.pluginName, parsed.modelId)
      .then((voices) => {
        if (!mounted) {
          return
        }
        setMmVoices(voices)
        setMmVoice((current) => {
          if (voices.some((voice) => voice.id === current)) {
            return current
          }
          return voices[0]?.id ?? ''
        })
      })
      .catch((error) => {
        console.error(error)
        if (mounted) {
          setMmVoices([])
          setMmVoice('')
          message.error('加载 TTS 角色失败')
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingVoices(false)
        }
      })
    return () => {
      mounted = false
    }
  }, [mmModel])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw) as ChatSession[]
      const restored = normalizeSessions(parsed)
      setSessions(restored)
      if (restored[0]) {
        setActiveSessionId(restored[0].id)
      }
    } catch (error) {
      console.error('Failed to parse chat sessions', error)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  }, [sessions])

  useEffect(() => {
    if (models.length === 0) {
      return
    }
    setSessions((prev) => {
      if (prev.length === 0) {
        const first = createSession(modelKeys[0])
        setActiveSessionId(first.id)
        return [first]
      }
      return prev.map((session) => {
        if (modelKeys.includes(session.settings.model)) {
          return session
        }
        return {
          ...session,
          settings: {
            ...session.settings,
            model: modelKeys[0],
          },
        }
      })
    })
  }, [models])

  const patchSession = (sessionId: string, updater: (session: ChatSession) => ChatSession) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) {
          return session
        }
        const updated = updater(session)
        return {
          ...updated,
          updatedAt: new Date().toISOString(),
        }
      })
    )
  }

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  )

  const activeTrace =
    activeSession && activeTraceIndex >= 0 && activeTraceIndex < activeSession.traces.length
      ? activeSession.traces[activeTraceIndex]
      : null

  const modelMap = useMemo(() => {
    const map = new Map<string, ModelRead>()
    for (const m of models) {
      map.set(`${m.provider_name}/${m.name}`, m)
    }
    return map
  }, [models])

  const modelKeys = useMemo(() => models.map((m) => `${m.provider_name}/${m.name}`), [models])

  const providers = useMemo(() => {
    const seen = new Set<string>()
    const result: { name: string; type: string; count: number }[] = []
    for (const m of models) {
      if (seen.has(m.provider_name)) continue
      seen.add(m.provider_name)
      result.push({ name: m.provider_name, type: m.provider_type, count: 0 })
    }
    for (const m of models) {
      const entry = result.find((p) => p.name === m.provider_name)
      if (entry) entry.count++
    }
    return result
  }, [models])

  const selectedModel = useMemo(() => {
    if (!activeSession?.settings.model) return null
    return modelMap.get(activeSession.settings.model) ?? null
  }, [activeSession?.settings.model, modelMap])

  const selectedProviderModels = useMemo(() => {
    if (!selectedModel) return models
    return models.filter((m) => m.provider_name === selectedModel.provider_name)
  }, [selectedModel, models])

  const selectedProviderModelKeys = useMemo(
    () => selectedProviderModels.map((m) => `${m.provider_name}/${m.name}`),
    [selectedProviderModels]
  )

  const hasReasoningTag = useMemo(
    () => selectedModel?.tags?.some((t) => t.toLowerCase() === 'reasoning') ?? false,
    [selectedModel]
  )

  /** Capability-filtered model lists for multimodal sub-tabs */
  const embeddingModels = useMemo(() => models.filter((m) => m.tags?.includes('embedding')), [models])
  const audioModels = useMemo(() => models.filter((m) => m.tags?.includes('audio')), [models])
  const imageModels = useMemo(() => models.filter((m) => m.tags?.includes('image')), [models])
  const videoModels = useMemo(() => models.filter((m) => m.tags?.includes('video')), [models])

  /** Providers that have at least one model in each capability */
  const embeddingProviders = useMemo(
    () => providers.filter((p) => embeddingModels.some((m) => m.provider_name === p.name)),
    [providers, embeddingModels]
  )
  const audioProviders = useMemo(
    () => providers.filter((p) => audioModels.some((m) => m.provider_name === p.name)),
    [providers, audioModels]
  )
  const imageProviders = useMemo(
    () => providers.filter((p) => imageModels.some((m) => m.provider_name === p.name)),
    [providers, imageModels]
  )
  const videoProviders = useMemo(
    () => providers.filter((p) => videoModels.some((m) => m.provider_name === p.name)),
    [providers, videoModels]
  )

  const createNewSession = () => {
    if (!modelKeys[0]) {
      message.warning('暂无可用模型，请先在模型管理中激活模型')
      return
    }
    const next = createSession(modelKeys[0])
    setSessions((prev) => [next, ...prev])
    setActiveSessionId(next.id)
    setActiveTraceIndex(-1)
    setDraft('')
    setPendingImages([])
  }

  const renameSession = (session: ChatSession) => {
    const title = window.prompt('请输入会话标题', session.title)
    if (!title || !title.trim()) {
      return
    }
    patchSession(session.id, (current) => ({
      ...current,
      title: title.trim(),
    }))
  }

  const deleteSession = (sessionId: string) => {
    Modal.confirm({
      title: '删除会话',
      content: '确认删除该会话及其所有记录？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setSessions((prev) => {
          const next = prev.filter((session) => session.id !== sessionId)
          if (next.length === 0 && modelKeys[0]) {
            const fallback = createSession(modelKeys[0])
            setActiveSessionId(fallback.id)
            return [fallback]
          }
          if (!next.find((session) => session.id === activeSessionId) && next[0]) {
            setActiveSessionId(next[0].id)
          }
          return next
        })
      },
    })
  }

  const clearActiveSession = () => {
    if (!activeSession) {
      return
    }
    patchSession(activeSession.id, (session) => ({
      ...session,
      title: '新会话',
      messages: [],
      traces: [],
    }))
    setActiveTraceIndex(-1)
    setPendingImages([])
  }

  const buildPayload = (
    session: ChatSession,
    userContent: string,
    images: PendingImage[]
  ): ChatCompletionRequest => {
    const messages: ChatCompletionRequest['messages'] = []
    if (session.settings.systemPrompt.trim()) {
      messages.push({ role: 'system', content: session.settings.systemPrompt.trim() })
    }
    for (const item of session.messages) {
      if (item.role === 'user' || item.role === 'assistant') {
        messages.push({ role: item.role, content: item.content })
      }
    }

    const trimmed = userContent.trim()
    if (images.length > 0) {
      const multimodalContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []
      if (trimmed) {
        multimodalContent.push({ type: 'text', text: trimmed })
      }
      for (const file of images) {
        multimodalContent.push({ type: 'image_url', image_url: { url: file.dataUrl } })
      }
      messages.push({ role: 'user', content: multimodalContent })
    } else {
      messages.push({ role: 'user', content: trimmed })
    }

    const payload: ChatCompletionRequest = {
      model: session.settings.model,
      messages,
      stream: session.settings.stream,
      temperature: session.settings.temperature,
      max_tokens: session.settings.maxTokens,
      top_p: session.settings.topP,
    }

    const tools = parseJson('tools', session.settings.toolsJson)
    if (Array.isArray(tools)) {
      payload.tools = tools
    }
    const skills = parseJson('skills', session.settings.skillsJson)
    if (Array.isArray(skills)) {
      payload.skills = skills
    }
    const toolChoice = parseJson('tool_choice', session.settings.toolChoiceJson)
    if (toolChoice != null) {
      payload.tool_choice = toolChoice
    }
    if (session.settings.thinkingEffort) {
      payload.reasoning_effort = session.settings.thinkingEffort
    }
    const extraBody = parseJson('extra_body', session.settings.extraBodyJson)
    if (extraBody && typeof extraBody === 'object' && !Array.isArray(extraBody)) {
      Object.assign(payload, extraBody)
    }

    return payload
  }

  const sendMessage = async (input: string) => {
    const text = input.trim()
    if ((!text && pendingImages.length === 0) || !activeSession || sending) {
      return
    }

    let basePayload: ChatCompletionRequest
    try {
      basePayload = buildPayload(activeSession, input, pendingImages)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '请求参数解析失败')
      return
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content:
        pendingImages.length > 0
          ? `${text || '[图片输入]'}\n\n${pendingImages.map((f) => `[image] ${f.name}`).join('\n')}`
          : text,
      createdAt: new Date().toISOString(),
    }

    const assistantMessageId = generateId()
    const trace: ChatDebugTrace = {
      request: basePayload,
      events: [],
    }

    patchSession(activeSession.id, (session) => ({
      ...session,
      title: session.messages.length === 0 ? inferTitleFromContent(text || '[图片输入]') : session.title,
      messages: [
        ...session.messages,
        userMessage,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
        },
      ],
      traces: [trace, ...session.traces],
    }))
    setActiveTraceIndex(0)
    setDraft('')
    setPendingImages([])
    setSending(true)

    const sessionId = activeSession.id
    const controller = new AbortController()
    abortRef.current = controller

    try {
      if (activeSession.settings.stream) {
        const toolCallMap: Record<number, ChatToolCall> = {}
        const events: ChatCompletionResponse[] = []
        let usageSnapshot: ChatCompletionResponse['usage']
        let costSnapshot: number | undefined

        await chatApi.chatCompletionsStream(basePayload, controller.signal, {
          onEvent: (event) => {
            events.push(event)
            if (event.usage) {
              usageSnapshot = event.usage
            }
            if (typeof event.cost === 'number') {
              costSnapshot = event.cost
            }
          },
          onTextDelta: (chunk) => {
            patchSession(sessionId, (session) => ({
              ...session,
              messages: session.messages.map((item) =>
                item.id === assistantMessageId
                  ? {
                      ...item,
                      content: `${item.content}${chunk}`,
                    }
                  : item
              ),
            }))
          },
          onToolCallDelta: (deltas) => {
            const merged = mergeToolCallDelta(toolCallMap, deltas)
            for (const [key, value] of Object.entries(merged)) {
              toolCallMap[Number(key)] = value
            }
            patchSession(sessionId, (session) => ({
              ...session,
              messages: session.messages.map((item) =>
                item.id === assistantMessageId
                  ? {
                      ...item,
                      toolCalls: Object.values(toolCallMap).sort((a, b) => a.index - b.index),
                    }
                  : item
              ),
            }))
          },
        })

        patchSession(sessionId, (session) => {
          const traces = [...session.traces]
          if (traces[0]) {
            traces[0] = {
              ...traces[0],
              events,
              response: events[events.length - 1]
                ? {
                    ...events[events.length - 1],
                    usage: usageSnapshot,
                    cost: costSnapshot,
                  }
                : undefined,
            }
          }
          return { ...session, traces }
        })
      } else {
        const response = await chatApi.chatCompletions({ ...basePayload, stream: false })
        const output = extractAssistantOutput(response)
        patchSession(sessionId, (session) => ({
          ...session,
          messages: session.messages.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: output.content,
                  toolCalls: output.toolCalls.length > 0 ? output.toolCalls : undefined,
                }
              : item
          ),
          traces: session.traces.map((item, index) =>
            index === 0
              ? {
                  ...item,
                  response,
                  events: [],
                }
              : item
          ),
        }))
      }
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') {
        message.warning('已停止生成')
      } else {
        const textError = error instanceof Error ? error.message : '聊天调用失败'
        patchSession(sessionId, (session) => ({
          ...session,
          messages: session.messages.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: item.content || `请求失败：${textError}`,
                }
              : item
          ),
          traces: session.traces.map((item, index) =>
            index === 0
              ? {
                  ...item,
                  error: textError,
                }
              : item
          ),
        }))
        message.error(textError)
      }
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  const handleReplay = (msg: ChatMessage) => {
    void sendMessage(msg.content)
  }

  const stopStreaming = () => {
    abortRef.current?.abort()
  }

  const testProviderConnection = async (providerName: string) => {
    const hide = message.loading(`正在测试 ${providerName} 连接...`, 0)
    try {
      await providerCatalogApi.remoteModels(providerName, true)
      hide()
      message.success(`${providerName} 连接成功`)
    } catch {
      hide()
      message.error(`${providerName} 连接失败，请检查 API 地址和密钥`)
    }
  }

  const testModelConnection = async (modelKey: string) => {
    const hide = message.loading(`正在测试 ${modelKey}...`, 0)
    try {
      await chatApi.chatCompletions({
        model: modelKey,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false,
      })
      hide()
      message.success(`${modelKey} 响应正常`)
    } catch {
      hide()
      message.error(`${modelKey} 无响应，该模型可能不支持直接对话`)
    }
  }

  const activeToolCalls = useMemo(() => {
    if (!activeSession) {
      return []
    }
    const latestAssistant = [...activeSession.messages]
      .reverse()
      .find((item) => item.role === 'assistant' && item.toolCalls && item.toolCalls.length > 0)
    return latestAssistant?.toolCalls ?? []
  }, [activeSession])

  const imageUploadList: UploadFile[] = pendingImages.map((item) => ({
    uid: item.uid,
    name: item.name,
    status: 'done',
  }))

  const audioUploadList: UploadFile[] = audioFile
    ? [
        {
          uid: 'audio',
          name: audioFile.name,
          status: 'done',
        },
      ]
    : []

  const runEmbeddings = async () => {
    setMmLoading(true)
    try {
      const data = await multimodalApi.embeddings({ model: mmModel, input: mmInput })
      setMmResult(data)
      message.success('Embedding 调用成功')
    } catch (error) {
      console.error(error)
      message.error('Embedding 调用失败')
    } finally {
      setMmLoading(false)
    }
  }

  const runTTS = async () => {
    const parsed = parsePluginTTSModel(mmModel)
    const voice = parsed ? mmVoice : 'alloy'
    if (parsed && !voice) {
      message.warning('请先选择角色')
      return
    }
    setMmLoading(true)
    try {
      const blob = await multimodalApi.speech({
        model: mmModel,
        input: mmInput,
        voice,
        response_format: 'mp3',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'speech.mp3'
      a.click()
      URL.revokeObjectURL(url)
      message.success('TTS 生成成功，已下载音频')
    } catch (error) {
      console.error(error)
      message.error('TTS 调用失败')
    } finally {
      setMmLoading(false)
    }
  }

  const runASR = async (translate: boolean) => {
    if (!audioFile) {
      message.warning('请先上传音频文件')
      return
    }
    setMmLoading(true)
    try {
      const req = { model: mmModel, file: audioFile, prompt: mmPrompt }
      const data = translate ? await multimodalApi.translate(req) : await multimodalApi.transcribe(req)
      setMmResult(data)
      message.success(translate ? '音频翻译成功' : '音频转写成功')
    } catch (error) {
      console.error(error)
      message.error(translate ? '音频翻译失败' : '音频转写失败')
    } finally {
      setMmLoading(false)
    }
  }

  const runImage = async () => {
    setMmLoading(true)
    try {
      const data = await multimodalApi.generateImage({
        model: mmModel,
        prompt: mmInput,
        response_format: 'url',
      })
      setMmResult(data)
      message.success('生图请求已完成')
    } catch (error) {
      console.error(error)
      message.error('生图失败')
    } finally {
      setMmLoading(false)
    }
  }

  const runVideo = async () => {
    setMmLoading(true)
    try {
      const data = await multimodalApi.generateVideo({
        model: mmModel,
        prompt: mmInput,
        response_format: 'url',
      })
      setMmResult(data)
      if (data?.id) {
        setVideoJobId(String(data.id))
      }
      message.success('视频任务已创建')
    } catch (error) {
      console.error(error)
      message.error('生视频失败')
    } finally {
      setMmLoading(false)
    }
  }

  const queryVideoJob = async () => {
    if (!videoJobId.trim()) {
      message.warning('请输入任务 ID')
      return
    }
    setMmLoading(true)
    try {
      const data = await multimodalApi.getVideoJob(videoJobId.trim())
      setMmResult(data)
      message.success('任务状态已刷新')
    } catch (error) {
      console.error(error)
      message.error('查询任务失败')
    } finally {
      setMmLoading(false)
    }
  }

  const runCompare = async () => {
    const userText = compareUserPrompt.trim()
    if (!userText || compareModels.length === 0) {
      message.warning('请选择至少一个模型并输入提示词')
      return
    }
    setCompareLoading(true)
    setCompareResults([])
    try {
      const req: ComparisonRequest = {
        messages: [{ role: 'user', content: userText }],
        models: compareModels,
        temperature: compareTemperature,
        max_tokens: compareMaxTokens,
        top_p: compareTopP,
      }
      if (compareSystemPrompt.trim()) {
        req.system_prompt = compareSystemPrompt.trim()
      }
      const data = await chatApi.compare(req)
      setCompareResults(data.comparisons)
    } catch (error: any) {
      message.error(error instanceof Error ? error.message : '比较请求失败')
    } finally {
      setCompareLoading(false)
    }
  }

  return (
    <div className="chat-workbench">
      <div className="chat-workbench-sidebar">
        <Card
          title="会话"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={createNewSession}>
              新建
            </Button>
          }
          className="chat-panel-card"
        >
          <List
            className="chat-session-list"
            dataSource={sessions}
            locale={{ emptyText: '暂无会话' }}
            renderItem={(session) => (
              <List.Item
                className={`chat-session-item ${session.id === activeSessionId ? 'chat-session-item-active' : ''}`}
                onClick={() => {
                  setActiveSessionId(session.id)
                  setActiveTraceIndex(-1)
                  setPendingImages([])
                }}
                actions={[
                  <Button
                    key="rename"
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={(event) => {
                      event.stopPropagation()
                      renameSession(session)
                    }}
                  />,
                  <Button
                    key="delete"
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(event) => {
                      event.stopPropagation()
                      deleteSession(session.id)
                    }}
                  />,
                ]}
              >
                <div className="chat-session-title">{session.title}</div>
                <Text type="secondary" className="chat-session-time">
                  {new Date(session.updatedAt).toLocaleString()}
                </Text>
              </List.Item>
            )}
          />
        </Card>
      </div>

      <div className="chat-workbench-main">
        <Card className="chat-panel-card chat-main-card">
          <Tabs
            defaultActiveKey="chat"
            items={[
              {
                key: 'chat',
                label: 'Chat 测试',
                children: (
                  <>
                    <div className="chat-main-header">
                      <div>
                        <Title level={5} className="chat-main-title">
                          Chat Web
                        </Title>
                        <Text type="secondary">支持 tools/skills、文件上传图片输入、流式调用与重放</Text>
                      </div>
                      <Space>
                        <Button onClick={clearActiveSession}>清空会话</Button>
                        <Button
                          type="primary"
                          icon={sending ? <StopOutlined /> : <SendOutlined />}
                          onClick={() => (sending ? stopStreaming() : void sendMessage(draft))}
                        >
                          {sending ? '停止生成' : '发送'}
                        </Button>
                      </Space>
                    </div>

                    <div className="chat-messages-wrap">
                      {!activeSession || activeSession.messages.length === 0 ? (
                        <Empty description="开始你的第一条消息" />
                      ) : (
                        <div className="chat-message-list">
                          {activeSession.messages.map((msg) => (
                            <div key={msg.id} className={`chat-message chat-message-${msg.role}`}>
                              <div className="chat-message-meta">
                                <Tag bordered={false}>{msg.role.toUpperCase()}</Tag>
                                <Text type="secondary">{new Date(msg.createdAt).toLocaleTimeString()}</Text>
                                {msg.role === 'user' && (
                                  <Button
                                    type="link"
                                    size="small"
                                    icon={<ReloadOutlined />}
                                    onClick={() => handleReplay(msg)}
                                  >
                                    重放
                                  </Button>
                                )}
                              </div>
                              <div className="chat-message-body">
                                {viewMode === 'rendered' ? (
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                                    {msg.content || ' '}
                                  </ReactMarkdown>
                                ) : (
                                  <pre>{msg.content || ''}</pre>
                                )}
                              </div>
                              {msg.toolCalls && msg.toolCalls.length > 0 && (
                                <div className="chat-tool-call-inline">
                                  <Text strong>
                                    <ToolOutlined /> 工具调用
                                  </Text>
                                  {msg.toolCalls.map((toolCall) => (
                                    <pre key={`${msg.id}-${toolCall.index}`}>{JSON.stringify(toolCall, null, 2)}</pre>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div
                      className={`chat-composer ${isDragging ? 'chat-composer-dragging' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (!isDragging) setIsDragging(true)
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        // Only hide when leaving the composer itself, not a child
                        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
                          setIsDragging(false)
                        }
                      }}
                      onDrop={async (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsDragging(false)
                        const files = Array.from(e.dataTransfer.files)
                        for (const file of files) {
                          if (!file.type.startsWith('image/')) continue
                          try {
                            const dataUrl = await fileToDataUrl(file)
                            const uid = generateId()
                            setPendingImages((prev) => [
                              ...prev,
                              { uid, name: file.name, dataUrl },
                            ])
                          } catch {
                            message.error(`读取图片失败: ${file.name}`)
                          }
                        }
                      }}
                    >
                      {isDragging && (
                        <div className="chat-drop-overlay">
                          <InboxOutlined className="chat-drop-icon" />
                          <span className="chat-drop-text">释放以上传文件</span>
                        </div>
                      )}
                      <Space direction="vertical" className="chat-full-width">
                        {pendingImages.length > 0 && (
                          <div className="chat-pending-images">
                            {pendingImages.map((img) => (
                              <div key={img.uid} className="chat-pending-image-item">
                                <img src={img.dataUrl} alt={img.name} className="chat-pending-image-thumb" />
                                <span className="chat-pending-image-name">{img.name}</span>
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => {
                                    setPendingImages((prev) => prev.filter((item) => item.uid !== img.uid))
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        <Upload
                          accept="image/*"
                          fileList={imageUploadList}
                          beforeUpload={async (file) => {
                            try {
                              const dataUrl = await fileToDataUrl(file)
                              setPendingImages((prev) => [
                                ...prev,
                                { uid: file.uid, name: file.name, dataUrl },
                              ])
                            } catch {
                              message.error(`读取图片失败: ${file.name}`)
                            }
                            return false
                          }}
                          onRemove={(file) => {
                            setPendingImages((prev) => prev.filter((item) => item.uid !== file.uid))
                          }}
                          multiple
                        >
                          <Button icon={<UploadOutlined />}>上传图片到本轮消息</Button>
                        </Upload>
                        <TextArea
                          rows={4}
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onPressEnter={(event) => {
                            if (event.shiftKey) {
                              return
                            }
                            event.preventDefault()
                            void sendMessage(draft)
                          }}
                          placeholder="输入消息，Enter 发送，Shift+Enter 换行（拖拽图片到此处上传）"
                        />
                      </Space>
                    </div>
                  </>
                ),
              },
              {
                key: 'embed',
                label: 'Embedding',
                children: (
                  <>
                    <Space direction="vertical" className="chat-full-width">
                      <MultimodalModelSelect
                        label="Embedding 模型"
                        models={embeddingModels}
                        providers={embeddingProviders}
                        value={mmModel}
                        onChange={setMmModel}
                        modelMap={modelMap}
                      />
                      <TextArea value={mmInput} onChange={(e) => setMmInput(e.target.value)} rows={4} placeholder="输入文本" />
                      <Button onClick={runEmbeddings} loading={mmLoading} type="primary">执行 Embedding</Button>
                    </Space>
                    <div className="chat-debug-content">
                      <pre>{mmResult ? JSON.stringify(mmResult, null, 2) : '暂无多模态结果'}</pre>
                    </div>
                  </>
                ),
              },
              {
                key: 'tts',
                label: 'TTS',
                children: (
                  <>
                    <Space direction="vertical" className="chat-full-width">
                      <MultimodalModelSelect
                        label="TTS 模型"
                        models={audioModels}
                        providers={audioProviders}
                        value={mmModel}
                        onChange={setMmModel}
                        modelMap={modelMap}
                        ttsPlugins={ttsPlugins}
                      />
                      <TextArea value={mmInput} onChange={(e) => setMmInput(e.target.value)} rows={4} placeholder="输入文本" />
                      {parsePluginTTSModel(mmModel) && (
                        <Space direction="vertical" className="chat-full-width">
                          <Select
                            value={mmVoice || undefined}
                            onChange={setMmVoice}
                            loading={loadingVoices}
                            placeholder="选择角色"
                            options={mmVoices.map((voice) => ({
                              value: voice.id,
                              label: formatVoiceLabel(voice),
                            }))}
                          />
                          <Text type="secondary">
                            {mmVoices.length === 0 ? '暂无可用角色' : '未下载角色会在首次使用时自动下载'}
                          </Text>
                        </Space>
                      )}
                      <Button onClick={runTTS} loading={mmLoading} type="primary">生成语音</Button>
                    </Space>
                    <div className="chat-debug-content">
                      <pre>{mmResult ? JSON.stringify(mmResult, null, 2) : '暂无多模态结果'}</pre>
                    </div>
                  </>
                ),
              },
              {
                key: 'asr',
                label: 'ASR',
                children: (
                  <>
                    <Space direction="vertical" className="chat-full-width">
                      <MultimodalModelSelect
                        label="ASR 模型"
                        models={audioModels}
                        providers={audioProviders}
                        value={mmModel}
                        onChange={setMmModel}
                        modelMap={modelMap}
                      />
                      <TextArea value={mmInput} onChange={(e) => setMmInput(e.target.value)} rows={2} placeholder="可选参考文本" />
                      <Upload
                        fileList={audioUploadList}
                        beforeUpload={(file) => {
                          setAudioFile(file)
                          return false
                        }}
                        onRemove={() => { setAudioFile(null) }}
                        maxCount={1}
                      >
                        <Button icon={<UploadOutlined />}>上传音频</Button>
                      </Upload>
                      <Input value={mmPrompt} onChange={(e) => setMmPrompt(e.target.value)} placeholder="ASR 可选提示词" />
                      <Space wrap>
                        <Button onClick={() => runASR(false)} loading={mmLoading}>音频转写</Button>
                        <Button onClick={() => runASR(true)} loading={mmLoading}>音频翻译</Button>
                      </Space>
                    </Space>
                    <div className="chat-debug-content">
                      <pre>{mmResult ? JSON.stringify(mmResult, null, 2) : '暂无多模态结果'}</pre>
                    </div>
                  </>
                ),
              },
              {
                key: 'image',
                label: '生图',
                children: (
                  <>
                    <Space direction="vertical" className="chat-full-width">
                      <MultimodalModelSelect
                        label="图片模型"
                        models={imageModels}
                        providers={imageProviders}
                        value={mmModel}
                        onChange={setMmModel}
                        modelMap={modelMap}
                      />
                      <TextArea value={mmInput} onChange={(e) => setMmInput(e.target.value)} rows={4} placeholder="输入提示词" />
                      <Button onClick={runImage} loading={mmLoading} type="primary">生成图片</Button>
                    </Space>
                    <div className="chat-debug-content">
                      <pre>{mmResult ? JSON.stringify(mmResult, null, 2) : '暂无多模态结果'}</pre>
                    </div>
                  </>
                ),
              },
              {
                key: 'video',
                label: '生视频',
                children: (
                  <>
                    <Space direction="vertical" className="chat-full-width">
                      <MultimodalModelSelect
                        label="视频模型"
                        models={videoModels}
                        providers={videoProviders}
                        value={mmModel}
                        onChange={setMmModel}
                        modelMap={modelMap}
                      />
                      <TextArea value={mmInput} onChange={(e) => setMmInput(e.target.value)} rows={4} placeholder="输入提示词" />
                      <Space wrap>
                        <Button onClick={runVideo} loading={mmLoading} type="primary">创建视频任务</Button>
                        <Input value={videoJobId} onChange={(e) => setVideoJobId(e.target.value)} placeholder="任务 ID" className="multimodal-video-job-input" />
                        <Button onClick={queryVideoJob} loading={mmLoading}>查询任务</Button>
                      </Space>
                    </Space>
                    <div className="chat-debug-content">
                      <pre>{mmResult ? JSON.stringify(mmResult, null, 2) : '暂无多模态结果'}</pre>
                    </div>
                  </>
                ),
              },
              {
                key: 'compare',
                label: 'Compare 对比',
                children: (
                  <Space direction="vertical" className="chat-full-width" size="middle">
                    <div>
                      <Text type="secondary">选择模型（可多选）</Text>
                      <Select
                        mode="multiple"
                        value={compareModels}
                        onChange={setCompareModels}
                        options={modelKeys.map((m) => ({ value: m, label: m }))}
                        placeholder="选择要对比的模型..."
                        className="chat-full-width"
                        maxTagCount="responsive"
                      />
                    </div>
                    <div>
                      <Text type="secondary">System Prompt</Text>
                      <TextArea
                        value={compareSystemPrompt}
                        onChange={(e) => setCompareSystemPrompt(e.target.value)}
                        rows={3}
                        placeholder="全局系统提示词（可选）"
                      />
                    </div>
                    <div>
                      <Text type="secondary">提示词</Text>
                      <TextArea
                        value={compareUserPrompt}
                        onChange={(e) => setCompareUserPrompt(e.target.value)}
                        rows={5}
                        placeholder="输入要发送给所有模型的提示词..."
                      />
                    </div>
                    <Space wrap>
                      <div>
                        <Text type="secondary">Temperature</Text>
                        <InputNumber
                          value={compareTemperature}
                          onChange={(v) => setCompareTemperature(v ?? 0.7)}
                          min={0}
                          max={2}
                          step={0.1}
                          style={{ width: 100 }}
                        />
                      </div>
                      <div>
                        <Text type="secondary">Max Tokens</Text>
                        <InputNumber
                          value={compareMaxTokens}
                          onChange={(v) => setCompareMaxTokens(v ?? 1024)}
                          min={1}
                          max={131072}
                          step={256}
                          style={{ width: 120 }}
                        />
                      </div>
                      <div>
                        <Text type="secondary">Top P</Text>
                        <InputNumber
                          value={compareTopP}
                          onChange={(v) => setCompareTopP(v ?? 1)}
                          min={0}
                          max={1}
                          step={0.05}
                          style={{ width: 100 }}
                        />
                      </div>
                      <Button
                        type="primary"
                        loading={compareLoading}
                        onClick={runCompare}
                        disabled={compareModels.length === 0 || !compareUserPrompt.trim()}
                      >
                        Compare
                      </Button>
                    </Space>
                    {compareLoading && (
                      <div style={{ textAlign: 'center', padding: 24 }}>
                        <Spin tip="正在请求所有模型..." />
                      </div>
                    )}
                    {!compareLoading && compareResults.length > 0 && (
                      <div className="compare-results-grid">
                        {compareResults.map((result) => (
                          <Card
                            key={result.model}
                            className="compare-result-card"
                            title={
                              <Space>
                                <Tag color={result.status === 'success' ? 'green' : 'red'}>
                                  {result.status === 'success' ? 'Success' : 'Error'}
                                </Tag>
                                <Text strong>{result.model}</Text>
                              </Space>
                            }
                            size="small"
                          >
                            {result.status === 'error' ? (
                              <Text type="danger">{result.error || 'Unknown error'}</Text>
                            ) : (
                              <>
                                <div className="compare-result-content">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                                    {result.content || '_No content_'}
                                  </ReactMarkdown>
                                </div>
                                <div className="compare-result-meta">
                                  {result.latency_ms !== undefined && (
                                    <Text type="secondary">Latency: {result.latency_ms}ms</Text>
                                  )}
                                  {result.usage && (
                                    <Text type="secondary">
                                      Tokens: {result.usage.prompt_tokens ?? 0}p + {result.usage.completion_tokens ?? 0}c = {result.usage.total_tokens ?? 0}t
                                    </Text>
                                  )}
                                  {result.usage?.cost !== undefined && (
                                    <Text type="secondary">Cost: ${result.usage.cost.toFixed(6)}</Text>
                                  )}
                                </div>
                              </>
                            )}
                          </Card>
                        ))}
                      </div>
                    )}
                    {!compareLoading && compareResults.length === 0 && (
                      <Empty description="选择模型并输入提示词，点击 Compare 按钮开始对比" />
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <div className="chat-workbench-right">
        <Card title="参数与工具" className="chat-panel-card">
          {loadingModels ? (
            <Spin />
          ) : (
            <Space direction="vertical" className="chat-settings-stack">
              <div>
                <div className="chat-setting-row">
                  <Text type="secondary">供应商</Text>
                  {selectedModel && (
                    <Button type="link" size="small" onClick={() => testProviderConnection(selectedModel.provider_name)}>
                      测试连接
                    </Button>
                  )}
                </div>
                <Select
                  value={selectedModel?.provider_name ?? undefined}
                  placeholder="选择供应商"
                  options={providers.map((p) => ({
                    value: p.name,
                    label: p.name,
                  }))}
                  onChange={(providerName) => {
                    if (!activeSession) return
                    const firstModel = models.find((m) => m.provider_name === providerName)
                    if (!firstModel) return
                    const modelKey = `${firstModel.provider_name}/${firstModel.name}`
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: { ...session.settings, model: modelKey, thinkingEffort: '' },
                    }))
                  }}
                  className="chat-full-width"
                  showSearch
                  filterOption={(input, option) => {
                    if (!option?.value) return false
                    return String(option.value).toLowerCase().includes(input.toLowerCase())
                  }}
                  labelRender={(option) => {
                    const color = getProviderColor(String(option.value))
                    return (
                      <span className="chat-model-select-label">
                        <span className="chat-model-option-dot" style={{ backgroundColor: color }} />
                        <span className="chat-model-select-label-text">{String(option.value)}</span>
                      </span>
                    )
                  }}
                  optionRender={(option) => {
                    const color = getProviderColor(String(option.value))
                    const p = providers.find((x) => x.name === option.value)
                    return (
                      <div className="chat-model-option">
                        <span className="chat-model-option-dot" style={{ backgroundColor: color }} />
                        <span className="chat-model-option-name">{String(option.value)}</span>
                        {p && <span className="chat-model-option-count">{p.count} 个模型</span>}
                      </div>
                    )
                  }}
                />
              </div>

              <div>
                <div className="chat-setting-row">
                  <Text type="secondary">模型</Text>
                  {activeSession?.settings.model && (
                    <Button type="link" size="small" onClick={() => testModelConnection(activeSession.settings.model)}>
                      测试
                    </Button>
                  )}
                </div>
                <Select
                  value={selectedModel ? `${selectedModel.provider_name}/${selectedModel.name}` : undefined}
                  placeholder={selectedModel ? '选择模型' : '请先选择供应商'}
                  options={selectedProviderModelKeys.map((key) => ({ value: key, label: key }))}
                  onChange={(value) => {
                    if (!activeSession) return
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: { ...session.settings, model: value, thinkingEffort: '' },
                    }))
                  }}
                  className="chat-full-width"
                  showSearch
                  filterOption={(input, option) => {
                    if (!option?.value) return false
                    const model = modelMap.get(String(option.value))
                    if (!model) return false
                    const q = input.toLowerCase()
                    return (
                      model.name.toLowerCase().includes(q) ||
                      (model.display_name || '').toLowerCase().includes(q) ||
                      model.tags?.some((t) => t.toLowerCase().includes(q)) ||
                      model.provider_name.toLowerCase().includes(q)
                    )
                  }}
                  labelRender={(option) => {
                    const model = modelMap.get(String(option.value))
                    return (
                      <span className="chat-model-select-label">
                        {model ? (
                          <span className="chat-model-option-dot" style={{ backgroundColor: getProviderColor(model.provider_type) }} />
                        ) : null}
                        <span className="chat-model-select-label-text">{model?.display_name || model?.name || String(option.value)}</span>
                      </span>
                    )
                  }}
                  optionRender={(option) => {
                    const model = modelMap.get(String(option.value))
                    if (!model) return <span>{String(option.value)}</span>
                    const tags = model.tags?.slice(0, 3) ?? []
                    const capTags = (model.tags ?? []).filter((t) => CAPABILITY_ICON_TAGS.has(t))
                    if (!capTags.includes('image') && model.config?.supports_vision) {
                      capTags.push('image')
                    }
                    const otherTags = tags.filter((t) => !CAPABILITY_ICON_TAGS.has(t))
                    return (
                      <div className="chat-model-option">
                        <div className="chat-model-option-info">
                          <span className="chat-model-option-name">{model.display_name || model.name}</span>
                        </div>
                        <span className="chat-model-option-cap-icons">
                          {capTags.map((tag) => {
                            const Icon = getTagIcon(tag)
                            return Icon ? <Icon key={tag} className="chat-model-option-cap-icon" title={tag} /> : null
                          })}
                        </span>
                        {otherTags.length > 0 && (
                          <span className="chat-model-option-tags">
                            {otherTags.map((tag) => (
                              <span key={tag} className="chat-model-option-tag">{tag}</span>
                            ))}
                          </span>
                        )}
                      </div>
                    )
                  }}
                />
              </div>

              {hasReasoningTag && (
                <div>
                  <Text type="secondary">思考层级 (reasoning_effort)</Text>
                  <Select
                    value={activeSession?.settings.thinkingEffort || undefined}
                    placeholder="默认"
                    allowClear
                    options={[
                      { value: 'low', label: '低 · low' },
                      { value: 'medium', label: '中 · medium' },
                      { value: 'high', label: '高 · high' },
                      { value: 'xhigh', label: '极高 · xhigh' },
                      { value: 'max', label: '最大 · max' },
                    ]}
                    onChange={(value) => {
                      if (!activeSession) return
                      patchSession(activeSession.id, (session) => ({
                        ...session,
                        settings: { ...session.settings, thinkingEffort: value || '' },
                      }))
                    }}
                    className="chat-full-width"
                  />
                </div>
              )}

              <div>
                <Text type="secondary">参数模板</Text>
                <Select
                  value={templateKey}
                  options={TEMPLATE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                  onChange={(value) => {
                    setTemplateKey(value)
                    const template = TEMPLATE_OPTIONS.find((item) => item.value === value)
                    if (!template || !activeSession) {
                      return
                    }
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: {
                        ...session.settings,
                        temperature: template.settings.temperature,
                        topP: template.settings.topP,
                        maxTokens: template.settings.maxTokens,
                      },
                    }))
                  }}
                  className="chat-full-width"
                />
              </div>

              <div className="chat-setting-row">
                <Text type="secondary">流式输出</Text>
                <Switch
                  checked={activeSession?.settings.stream}
                  onChange={(checked) => {
                    if (!activeSession) {
                      return
                    }
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: {
                        ...session.settings,
                        stream: checked,
                      },
                    }))
                  }}
                />
              </div>

              <div>
                <Text type="secondary">Temperature</Text>
                <InputNumber
                  min={0}
                  max={2}
                  step={0.1}
                  value={activeSession?.settings.temperature}
                  onChange={(value) => {
                    if (value == null || !activeSession) {
                      return
                    }
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: {
                        ...session.settings,
                        temperature: Number(value),
                      },
                    }))
                  }}
                  className="chat-full-width"
                />
              </div>

              <div>
                <Text type="secondary">Top P</Text>
                <InputNumber
                  min={0}
                  max={1}
                  step={0.1}
                  value={activeSession?.settings.topP}
                  onChange={(value) => {
                    if (value == null || !activeSession) {
                      return
                    }
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: {
                        ...session.settings,
                        topP: Number(value),
                      },
                    }))
                  }}
                  className="chat-full-width"
                />
              </div>

              <div>
                <Text type="secondary">Max Tokens</Text>
                <InputNumber
                  min={1}
                  max={16384}
                  step={64}
                  value={activeSession?.settings.maxTokens}
                  onChange={(value) => {
                    if (value == null || !activeSession) {
                      return
                    }
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: {
                        ...session.settings,
                        maxTokens: Number(value),
                      },
                    }))
                  }}
                  className="chat-full-width"
                />
              </div>

              <div>
                <Text type="secondary">System Prompt</Text>
                <TextArea
                  rows={3}
                  value={activeSession?.settings.systemPrompt}
                  onChange={(event) => {
                    if (!activeSession) {
                      return
                    }
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: {
                        ...session.settings,
                        systemPrompt: event.target.value,
                      },
                    }))
                  }}
                  placeholder="可选：系统提示词"
                />
              </div>

              <div>
                <Text type="secondary">Tools JSON（数组）</Text>
                <TextArea
                  rows={4}
                  value={activeSession?.settings.toolsJson}
                  onChange={(event) => {
                    if (!activeSession) {
                      return
                    }
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: {
                        ...session.settings,
                        toolsJson: event.target.value,
                      },
                    }))
                  }}
                  placeholder='例如: [{"type":"function","function":{"name":"get_weather","parameters":{"type":"object"}}}]'
                />
              </div>

              <div>
                <Text type="secondary">Skills JSON（数组）</Text>
                <TextArea
                  rows={3}
                  value={activeSession?.settings.skillsJson}
                  onChange={(event) => {
                    if (!activeSession) {
                      return
                    }
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: {
                        ...session.settings,
                        skillsJson: event.target.value,
                      },
                    }))
                  }}
                  placeholder='例如: ["web_search", "reasoning"]'
                />
              </div>

              <div>
                <Text type="secondary">Tool Choice JSON</Text>
                <TextArea
                  rows={2}
                  value={activeSession?.settings.toolChoiceJson}
                  onChange={(event) => {
                    if (!activeSession) {
                      return
                    }
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: {
                        ...session.settings,
                        toolChoiceJson: event.target.value,
                      },
                    }))
                  }}
                  placeholder='例如: "auto" 或 {"type":"function","function":{"name":"get_weather"}}'
                />
              </div>

              <div>
                <Text type="secondary">Extra Body JSON（对象）</Text>
                <TextArea
                  rows={3}
                  value={activeSession?.settings.extraBodyJson}
                  onChange={(event) => {
                    if (!activeSession) {
                      return
                    }
                    patchSession(activeSession.id, (session) => ({
                      ...session,
                      settings: {
                        ...session.settings,
                        extraBodyJson: event.target.value,
                      },
                    }))
                  }}
                  placeholder='例如: {"presence_penalty":0.2}'
                />
              </div>
            </Space>
          )}
        </Card>

        <Card title="调试" className="chat-panel-card chat-debug-card">
          <Segmented
            value={viewMode}
            options={[
              { label: 'Markdown', value: 'rendered' },
              { label: 'Raw', value: 'raw' },
            ]}
            onChange={(value) => setViewMode(value as 'rendered' | 'raw')}
          />

          <div className="chat-trace-select-wrap">
            <Select
              value={activeTraceIndex >= 0 ? activeTraceIndex : undefined}
              placeholder="选择请求记录"
              options={(activeSession?.traces ?? []).map((trace, index) => ({
                value: index,
                label: `${index + 1}. ${trace.request.model}`,
              }))}
              onChange={(value) => setActiveTraceIndex(Number(value))}
              allowClear
              className="chat-full-width"
            />
          </div>

          <div className="chat-debug-content">
            {activeTrace ? (
              <pre>{JSON.stringify(activeTrace, null, 2)}</pre>
            ) : (
              <Empty description="暂无调试数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>

          <div className="chat-tool-calls-panel">
            <Text strong>
              <ToolOutlined /> 工具调用面板
            </Text>
            {activeToolCalls.length === 0 ? (
              <Text type="secondary">暂无工具调用</Text>
            ) : (
              activeToolCalls.map((toolCall) => (
                <pre key={`${toolCall.id}-${toolCall.index}`}>{JSON.stringify(toolCall, null, 2)}</pre>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default ChatWorkbench
