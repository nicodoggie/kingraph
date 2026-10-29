# Getting started

A family tree is a [YAML](http://yaml.org/) file. Start with a `families` collection. Every family can have `parents` and `children`.

```diff
+families:
+  - parents: [Marge, Homer]
+    children: [Bart, Lisa, Maggie]
```

## Generating

kingraph can give you `svg` (default), `png` or `dot` files. Built-in PNG uses
resvg and does not require a browser. For PDF output or local `picture` files
without a configured picture resolver, emit DOT and convert it using native
Graphviz, which can read those files. A configured resolver can instead embed
PNG/JPEG pictures directly in portable SVG/PNG output; see
[pictures and portable downloads](../README.md#pictures-and-portable-downloads).

```sh
kingraph family.yaml > family.svg
kingraph family.yaml -F png > family.png
kingraph family.yaml -F dot > family.dot
```

## Defining names

To define their full names, add a `people` collection. This is optional—people will still be in the family tree even if they don't have a `people` record.

```diff
 families:
   - parents: [Marge, Homer]
     children: [Bart, Lisa, Maggie]
+people:
+  Marge:
+    fullname: Marjorie Bouvier Simpson
```

## Second generations

To create second generations, you can simply add another record to `families`.

```diff
 families:
   - parents: [Marge, Homer]
     children: [Bart, Lisa, Maggie]
+  - parents: [Lisa, Milhouse]
+    children: [Zia]
```

## Houses

Turn a family into a house by adding a `house` name. They will show up grouped in a box.

```diff
 families:
+  - house: Stark
     parents: [Ned, Catelyn]
     children: [Arya, Rickon, Bran, Sansa, Rob]
+  - house: Lannister
     parents: [Tywin, Joanna]
     children: [Cersei, Jaime, Tyrion]
```

To add families into a house, nest the families.

```diff
 families:
   - house: Simpson
     parents: [Marge, Homer]
     children: [Bart, Lisa, Maggie]
+    families:
+      - parents: [Lisa, Milhouse]
+        children: [Zia]
```

<details>
<summary>*Why nest?*</summary>

Families can be placed as sub-families of another families. This is more of a visual designation rather than a semantic one. If the parent family is a "house", then the sub-families will show up in the same house.

It also helps to untangle your YAML file.
</details>

## Next

In a checkout, run `npm run dev` to explore the browser playground. Its feature
examples demonstrate links and tooltips, nested houses, alternate connection
styles, layout and colors, dates/ages and illustrated portraits. Select an example,
read its short description and press **Render**. The portrait sample uses bundled
assets; arbitrary picture URLs are not fetched from editor input. Both downloads
use the last successful rendered SVG, including its embedded pictures.

See [advanced usage](advanced.md) for more features.

For declarative local, remote or inline pictures, see the
[v2 picture catalog guide](pictures.md). V2 explicitly declares image sources;
CLI file inputs and Vite imports supply the source location for relative paths.
Use `--base-dir` when reading a path-bearing document from stdin.
