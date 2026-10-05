# Pricing Data Sources

本目录提供各 provider 的价格数据示例，可直接用于：

- `LLM_ROUTER_PRICING_SOURCE_URLS`（本地文件模式）
- `scripts/pricing_sync.sh`

约定：
- 文件名：`<provider>.json`
- 支持字段：`model_name|name|model|id`、`input_price_per_1k`、`output_price_per_1k`
- 可选字段：`notes`、`unit`（`per_1k` 或 `per_token`）

示例：

```json
[
  {
    "model_name": "qwen-plus",
    "input_price_per_1k": 0.4,
    "output_price_per_1k": 1.2
  }
]
```
