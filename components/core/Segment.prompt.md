# Segment

Segmented control — a single bordered pill split into 2–4 options with the active one filled by the accent wash. Used for weight-method (`Recency / Per-day / Blend`) and view switching.

```jsx
<Segment options={['Recency','Per-day','Blend']} value={method} onChange={setMethod} />
```

Options accept plain strings or `{value, label}` objects.
