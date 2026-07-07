# Modal

The app's centered dialog (Help, Accuracy, City search). Dimmed backdrop, rounded surface card capped at 540px with its own scroll, a close × in the corner. Click the backdrop or × to dismiss. Section headings inside use the accent-blue uppercase `h3` convention.

```jsx
<Modal title="WeatherBlend" subtitle="Multi-model forecast" onClose={close}>
  <p>Fetches forecasts from multiple models and blends them…</p>
</Modal>
```

Pass a `footer` for a sticky Close button.
