package slicer

// Package slicer handles video slicing: probing duration with ffprobe,
// planning fixed-length segments, and extracting representative frames from
// each segment with ffmpeg.
//
// Following the Go community convention, Go only orchestrates; the actual
// probing and frame extraction is delegated to ffmpeg/ffprobe subprocesses.

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// Segment is one slicing unit: a time range plus its extracted frame files.
type Segment struct {
	Index  int      `json:"index"`
	Start  float64  `json:"start"`
	End    float64  `json:"end"`
	Frames []string `json:"-"`
}

// CheckTools verifies ffmpeg and ffprobe are installed.
func CheckTools() error {
	for _, tool := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(tool); err != nil {
			return fmt.Errorf("%s not found in PATH, install it first (e.g. brew install ffmpeg): %w", tool, err)
		}
	}
	return nil
}

// ProbeDuration returns the video duration in seconds via ffprobe.
func ProbeDuration(ctx context.Context, videoPath string) (float64, error) {
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		videoPath,
	)
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return 0, fmt.Errorf("ffprobe duration: %w: %s", err, errBuf.String())
	}
	d, err := strconv.ParseFloat(strings.TrimSpace(out.String()), 64)
	if err != nil {
		return 0, fmt.Errorf("parse duration %q: %w", out.String(), err)
	}
	if d <= 0 {
		return 0, fmt.Errorf("invalid duration %v", d)
	}
	return d, nil
}

// PlanSegments splits [0, duration] into fixed-length segments. The last
// segment may be shorter; trailing slivers under 1s are merged into the
// previous segment.
func PlanSegments(duration, segmentSeconds float64) []Segment {
	var segs []Segment
	idx := 0
	for start := 0.0; start < duration; start += segmentSeconds {
		end := start + segmentSeconds
		if end > duration {
			end = duration
		}
		segs = append(segs, Segment{Index: idx, Start: start, End: end})
		idx++
	}
	// Merge a trailing sliver (< 1s) into the previous segment.
	if n := len(segs); n >= 2 && segs[n-1].End-segs[n-1].Start < 1 {
		segs[n-2].End = segs[n-1].End
		segs = segs[:n-1]
	}
	return segs
}

// ExtractFrames samples framesPerSegment frames from the segment at
// midpoints (start + (k+0.5)*len/n, avoiding boundary black frames), scales
// them to frameWidth and writes JPEG files into dir. Returns file paths in
// time order.
func ExtractFrames(ctx context.Context, videoPath string, seg Segment, framesPerSegment, frameWidth int, dir string) ([]string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	span := seg.End - seg.Start
	paths := make([]string, 0, framesPerSegment)
	for k := 0; k < framesPerSegment; k++ {
		t := seg.Start + span*(float64(k)+0.5)/float64(framesPerSegment)
		if t >= seg.End {
			t = seg.End - 0.1
		}
		out := filepath.Join(dir, fmt.Sprintf("seg%04d_f%d.jpg", seg.Index, k))
		// A corrupted stream tail may make the decoder produce no frame at
		// the requested timestamp (ffmpeg exits 0 with an empty output);
		// back off one second per attempt, reaching slightly before the
		// segment start so a truncated tail still yields a nearby frame.
		limit := seg.Start - 5
		if limit < 0 {
			limit = 0
		}
		var ok bool
		for attempt, ts := 0, t; attempt < 8 && ts >= limit; attempt, ts = attempt+1, ts-1.0 {
			if err := extractOne(ctx, videoPath, ts, frameWidth, out); err != nil {
				return nil, fmt.Errorf("extract frame at %.3fs: %w", ts, err)
			}
			if info, err := os.Stat(out); err == nil && info.Size() > 0 {
				ok = true
				break
			}
		}
		if !ok {
			return nil, fmt.Errorf("extract frame at %.3fs: no decodable frame after backoff", t)
		}
		paths = append(paths, out)
	}
	return paths, nil
}

// extractOne runs a single ffmpeg frame extraction. Note that ffmpeg may
// exit 0 while writing an empty file when the seek target is undecodable,
// so callers must check the output file size.
func extractOne(ctx context.Context, videoPath string, t float64, frameWidth int, out string) error {
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-v", "error",
		"-ss", strconv.FormatFloat(t, 'f', 3, 64),
		"-i", videoPath,
		"-frames:v", "1",
		"-vf", fmt.Sprintf("scale=%d:-2,format=yuvj420p", frameWidth),
		"-q:v", "4",
		"-f", "image2",
		out,
	)
	var errBuf bytes.Buffer
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%w: %s", err, errBuf.String())
	}
	return nil
}

// FormatTime renders seconds as HH:MM:SS for reports.
func FormatTime(seconds float64) string {
	s := int(seconds + 0.5)
	return fmt.Sprintf("%02d:%02d:%02d", s/3600, (s%3600)/60, s%60)
}
