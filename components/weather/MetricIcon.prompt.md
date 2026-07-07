# MetricIcon

Small line-glyph for one of the four metrics — thermometer (temp), drop (rain), wind streams (wind), cloud. Drawn in `currentColor`, defaulting to that metric's quatrefoil hue, so it always reads as the right metric.

```jsx
<MetricIcon metric="rain" />
<MetricIcon metric="wind" size={20} />
```

Metrics: `temp` · `rain` · `wind` · `cloud`.
