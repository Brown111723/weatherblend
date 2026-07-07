# BottomNav & Drawer

`BottomNav` is the fixed bottom section switcher (Cards / Table / Map) — icon over label, accent wash on the active item. `Drawer` is the slide-in ☰ menu with the brand header and list-style items that highlight to the accent on hover.

```jsx
<BottomNav items={[{id:'cards',label:'Cards',icon:<CardsSvg/>}, …]}
  active="cards" onChange={setView} />

<Drawer open={menuOpen} onClose={()=>setMenu(false)} label="Options"
  items={[{label:'Forecast accuracy', icon:<ChartSvg/>, onClick:showAccuracy}]} />
```

Wrap `BottomNav` in a `position:fixed` footer yourself.
