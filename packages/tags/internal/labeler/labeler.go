package labeler

// Package labeler calls the vision LLM on a segment's representative frames
// and parses the structured JSON reply into cluster labels.

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"

	"github.com/hangtiancheng/26autumn/docs/tags/internal/slicer"
)

// maxLabels caps how many labels one segment may carry.
const maxLabels = 5

// maxRetries is the number of extra attempts after an invalid reply.
const maxRetries = 2

// fallbackLabel guarantees every segment carries at least one label.
const fallbackLabel = "未能识别内容"

// Result is the structured output of one labeling call.
type Result struct {
	Labels  []string `json:"labels"`
	Summary string   `json:"summary"`
}

// Labeler wraps a chat model and produces cluster labels for segments.
type Labeler struct {
	model model.ChatModel
}

// New creates a Labeler over the given chat model.
func New(m model.ChatModel) *Labeler {
	return &Labeler{model: m}
}

const systemPrompt = `你是一名视频内容分析专家, 负责分析视频切片的代表帧, 产出聚类标签. 

要求:
1. 只输出严格的 JSON, 不要输出任何其他内容, 格式: {"labels": ["标签1", "标签2"], "summary": "一句话描述"}
2. labels 为该切片的聚类标签数组, 必须包含 1 到 3 个标签
3. 每个标签是简短的中文描述, 不超过 12 个字, 概括画面内容、场景或主题
4. 标签应具备聚类价值, 同类内容应产出相同或相近的标签, 避免过于具体的专有名词
5. summary 为对该切片内容的一句话中文总结, 不超过 50 字`

// LabelSegment sends the segment's frames to the vision model and returns
// validated labels. It retries on malformed output and falls back to a
// placeholder label so that every segment carries at least one label.
func (l *Labeler) LabelSegment(ctx context.Context, seg slicer.Segment) (*Result, error) {
	parts, err := buildParts(seg)
	if err != nil {
		return nil, err
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		msgs := []*schema.Message{
			schema.SystemMessage(systemPrompt),
			{Role: schema.User, UserInputMultiContent: parts},
		}
		if attempt > 0 {
			msgs = append(msgs, schema.UserMessage(
				fmt.Sprintf("上一次输出不是合法 JSON 或缺少标签 (%v), 请只输出符合要求的 JSON. ", lastErr)))
		}
		resp, err := l.model.Generate(ctx, msgs)
		if err != nil {
			return nil, fmt.Errorf("generate: %w", err)
		}
		res, err := parseResult(resp.Content)
		if err != nil {
			lastErr = err
			continue
		}
		return res, nil
	}
	// Guarantee the MUST-have-one-label invariant even after retries fail.
	return &Result{Labels: []string{fallbackLabel}, Summary: "LLM 多次返回非法结果: " + lastErr.Error()}, nil
}

// buildParts assembles the multimodal user message: one text part describing
// the segment, followed by the frame images in time order.
func buildParts(seg slicer.Segment) ([]schema.MessageInputPart, error) {
	text := fmt.Sprintf(
		"这是视频第 %d 个切片 (时间范围 %s - %s) 的 %d 张代表帧, 按时间顺序排列, 请分析并输出 JSON. ",
		seg.Index+1, slicer.FormatTime(seg.Start), slicer.FormatTime(seg.End), len(seg.Frames),
	)
	parts := []schema.MessageInputPart{
		{Type: schema.ChatMessagePartTypeText, Text: text},
	}
	for _, frame := range seg.Frames {
		data, err := os.ReadFile(frame)
		if err != nil {
			return nil, fmt.Errorf("read frame %s: %w", frame, err)
		}
		b64 := base64.StdEncoding.EncodeToString(data)
		parts = append(parts, schema.MessageInputPart{
			Type: schema.ChatMessagePartTypeImageURL,
			Image: &schema.MessageInputImage{
				MessagePartCommon: schema.MessagePartCommon{
					Base64Data: &b64,
					MIMEType:   "image/jpeg",
				},
				Detail: schema.ImageURLDetailAuto,
			},
		})
	}
	return parts, nil
}

// parseResult extracts the JSON object from the reply (tolerating markdown
// fences or surrounding prose) and validates the label list.
func parseResult(content string) (*Result, error) {
	start, end := strings.Index(content, "{"), strings.LastIndex(content, "}")
	if start < 0 || end <= start {
		return nil, fmt.Errorf("no JSON object in reply: %q", truncate(content, 120))
	}
	var res Result
	if err := json.Unmarshal([]byte(content[start:end+1]), &res); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	res.Labels = normalizeLabels(res.Labels)
	if len(res.Labels) == 0 {
		return nil, fmt.Errorf("empty labels")
	}
	res.Summary = strings.TrimSpace(res.Summary)
	return &res, nil
}

// normalizeLabels trims, drops empties, dedupes and caps the label list.
func normalizeLabels(labels []string) []string {
	seen := make(map[string]struct{}, len(labels))
	out := make([]string, 0, len(labels))
	for _, l := range labels {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		if _, dup := seen[l]; dup {
			continue
		}
		seen[l] = struct{}{}
		out = append(out, l)
		if len(out) == maxLabels {
			break
		}
	}
	return out
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "..."
}
