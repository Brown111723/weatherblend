# Toggle

Icon-square toggle from the Sources panel — a 40px rounded button with an icon and a caption. Enabled state fills the button and tints the icon with the metric's quatrefoil colour; disabled dims to 40%.

```jsx
<Toggle icon={<TempIcon/>} label="Temp" enabled color="var(--q-temp)" onClick={setTemp} />
```

Pair one per metric (temp/rain/wind/cloud) in a row.
