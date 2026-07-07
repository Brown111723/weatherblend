# MetricCard

The glassy metric box from the cards view. A 2px quatrefoil top-accent and coloured uppercase title mark the metric; below sit the big value and one or two muted sub-lines. Set `glass` when it floats over the hero gradient.

```jsx
<MetricCard metric="temp" title="Temp" value="24°"
  subs={["Feels 22°", "↑ 26°  ↓ 14°"]} confidence={82} />
<MetricCard metric="rain" title="Rain" value="0.4 mm" subs={["Day total"]} glass />
```

Metrics: `temp` · `rain` · `wind` · `cloud`.
