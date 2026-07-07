# ConfidenceTag & ModelToggle

`ConfidenceTag` renders the plain-English agreement read-out (High/Medium/Low, green/amber/rose). `ModelToggle` is the enable/disable row for a source model in the "Models & sources" panel.

```jsx
<ConfidenceTag value={82} showPct />
<ModelToggle model="ecmwf" enabled onClick={setEnabled} />
<ModelToggle model="cma" unavailable />
```

A disabled model leaves the blend; `unavailable` marks one that returned no data.
