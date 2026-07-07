# Sparkline

The hero day-trace from the condition card. Draws a metric's hourly values as a value-ramped line over a soft gradient area. The portion past `split` (0–1) is dashed to distinguish forecast from observed; amber `ticks` mark sunrise/sunset. Stretches to fill its container width.

```jsx
<Sparkline values={hourlyTemps} metric="temp" split={0.5}
  ticks={[{frac:0.28,kind:'rise'},{frac:0.78,kind:'set'}]} />
<Sparkline values={hourlyRain} metric="rain" zeroBase />
```

Use `zeroBase` for rain and wind so the baseline sits at 0.
