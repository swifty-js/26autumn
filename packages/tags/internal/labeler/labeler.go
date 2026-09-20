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
const fallbackLabel = "unrecognized content"

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

const systemPrompt = `You are a video content analysis expert responsible for analyzing the representative frames of video segments and producing cluster labels.

Requirements:
1. Output strictly valid JSON only, with no additional content. Format: {"labels": ["label1", "label2"], "summary": "one-sentence description"}
2. labels is the array of cluster labels for the segment and must contain 1 to 3 labels.
3. Each label is a short English description of no more than 12 words, summarizing the visual content, scene, or subject.
4. Labels should be clustering-friendly: similar content should yield identical or closely related labels. Avoid overly specific proper nouns.
5. summary is a one-sentence English summary of the segment content, no more than 50 words.`

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
				fmt.Sprintf("The previous output was not valid JSON or was missing labels (%v). Please output only JSON that meets the requirements. ", lastErr)))
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
	return &Result{Labels: []string{fallbackLabel}, Summary: "LLM returned invalid results after multiple attempts: " + lastErr.Error()}, nil
}

// buildParts assembles the multimodal user message: one text part describing
// the segment, followed by the frame images in time order.
func buildParts(seg slicer.Segment) ([]schema.MessageInputPart, error) {
	text := fmt.Sprintf(
		"These are the representative frames for segment %d of the video (time range %s - %s), %d frames in chronological order. Please analyze them and output JSON. ",
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
