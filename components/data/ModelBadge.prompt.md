# ModelBadge & WeightBadge

`ModelBadge` is the coloured round dot (with the model's short letter) that identifies each of the 7 source models in tables and panels. `WeightBadge` shows a blend weight, coloured green / amber / rose by magnitude. The `MODELS` map exports every model's short, colour, label and description.

```jsx
<ModelBadge model="ecmwf" weight={0.24} />
<ModelBadge model="gfs" />
<WeightBadge weight={0.08} />   {/* → 8%, low/rose */}
```

Model keys: `gfs` `ecmwf` `icon` `gem` `ukmo` `cma` `jma`. `weight` accepts a 0–1 fraction or a percent.
