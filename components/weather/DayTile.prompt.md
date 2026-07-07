# DayTile

One tile in the horizontal "fingerprint" day-selector strip — a weekday label, a tiny temperature spark, high/low and the rain total. States: `selected` (accent ring), `today` (dot after the label), `past` (dimmed).

```jsx
<DayTile dow="Wed" hi={26} lo={14} rain={0.4} values={temps} today selected />
```

Lay several in a horizontally-scrolling flex row.
