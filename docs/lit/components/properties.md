---
title: 响应式属性
eleventyNavigation:
  key: Reactive properties
  parent: Components
  order: 3
versionLinks:
  v1: components/properties/
  v2: components/properties/
---

Lit 组件接收输入并将其状态存储为 JavaScript 类字段或属性。*响应式属性*是在更改时可以触发响应式更新周期、重新渲染组件的属性，并且可以选择性地读取或写入特性。

{% switchable-sample %}

```ts
class MyElement extends LitElement {
  @property()
  name?: string;
}
```

```js
class MyElement extends LitElement {
  static properties = {
    name: {},
  };
}
```

{% endswitchable-sample %}

Lit 管理你的响应式属性及其对应的特性。具体来说：

- 响应式更新。Lit 为每个响应式属性生成一个 getter/setter 对。当响应式属性更改时，组件调度一次更新。
- 特性处理。默认情况下，Lit 设置一个与属性对应的被观察特性，并在特性更改时更新属性。属性值也可以选择性地*反射*回特性。
- 超类属性。Lit 自动应用超类声明的属性选项。除非你想更改选项，否则不需要重新声明属性。
- 元素升级。如果 Lit 组件在元素已经在 DOM 中之后才被定义，Lit 会处理升级逻辑，确保在升级前设置在元素上的任何属性在元素升级时触发正确的响应式副作用。

## 公共属性和内部状态

公共属性是组件公共 API 的一部分。通常，公共属性——特别是公共响应式属性——应被视为*输入*。

组件不应该更改自己的公共属性，除非是响应用户输入。例如，菜单组件可能有一个公共的 `selected` 属性，可以由元素的所有者初始化为给定值，但当用户选择项目时由组件本身更新。在这些情况下，组件应该派发一个事件来向组件的所有者指示 `selected` 属性已更改。有关更多详细信息，请参阅[派发事件](/docs/v3/components/events/#dispatching-events)。

Lit 还支持*内部响应式状态*。内部响应式状态是指不属于组件 API 的响应式属性。这些属性没有对应的特性，通常在 TypeScript 中标记为 protected 或 private。

{% switchable-sample %}

```ts
@state()
private _counter = 0;
```

```js
static properties = {
  _counter: {state: true}
};

constructor() {
  super();
  this._counter = 0;
}
```

{% endswitchable-sample %}

组件操作自己的内部响应式状态。
在某些情况下，内部响应式状态可能从公共属性初始化——例如，如果用户可见的属性和内部状态之间存在昂贵的转换。

与公共响应式属性一样，更新内部响应式状态会触发更新周期。有关更多信息，请参阅[内部响应式状态](#internal-reactive-state)。

## 公共响应式属性 {#declare}

使用装饰器或静态 `properties` 字段来声明元素的公共响应式属性。

在任何一种情况下，你都可以传递一个选项对象来配置属性的功能。

### 使用装饰器声明属性 {#declare-with-decorators}

使用 `@property` 装饰器配合类字段声明来声明响应式属性。

```ts
class MyElement extends LitElement {
  @property({ type: String })
  mode?: string;

  @property({ attribute: false })
  data = {};
}
```

`@property` 装饰器的参数是一个[选项对象](#property-options)。省略参数等同于指定所有选项的默认值。

<div class="alert alert-info">

使用装饰器。装饰器是一项提议中的 JavaScript 特性，因此你需要使用 Babel 或 TypeScript 编译器等编译器来使用装饰器。有关详细信息，请参阅[启用装饰器](/docs/v3/components/decorators/#enabling-decorators)。

</div>

### 在静态 properties 类字段中声明属性

要在静态 `properties` 类字段中声明属性：

```js
class MyElement extends LitElement {
  static properties = {
    mode: { type: String },
    data: { attribute: false },
  };

  constructor() {
    super();
    this.data = {};
  }
}
```

空的选项对象等同于指定所有选项的默认值。

### 声明属性时避免类字段问题 {#avoiding-issues-with-class-fields}

[类字段](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Public_class_fields)与响应式属性存在有问题的交互。类字段定义在元素实例上，而响应式属性定义为元素原型上的访问器。根据 JavaScript 的规则，实例属性优先于原型属性并有效地隐藏了它。这意味着当使用类字段时，响应式属性访问器不起作用，设置属性不会触发元素更新。

```js
class MyElement extends LitElement {
  static properties = { foo: { type: String } };
  foo = "Default"; // ❌ 这将使 `foo` 不具有响应性
}
```

在 JavaScript 中，声明响应式属性时不能使用类字段。相反，属性必须在元素构造函数中初始化：

```js
class MyElement extends LitElement {
  static properties = {
    foo: { type: String },
  };
  constructor() {
    super();
    this.foo = "Default";
  }
}
```

或者，你可以使用[带有 Babel 的标准装饰器](/docs/v3/components/decorators/#decorators-babel)来声明响应式属性。

```ts
class MyElement extends LitElement {
  @property()
  accessor foo = "Default";
}
```

对于 TypeScript，只要你使用以下模式之一，就可以使用类字段来声明响应式属性：

- 将 `useDefineForClassFields` 编译器选项设置为 `false`。这已经是[在 TypeScript 中使用装饰器](/docs/v3/components/decorators/#decorators-typescript)时的建议。

```json
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true, // 如果使用装饰器
    "useDefineForClassFields": false
  }
}
```

```ts
class MyElement extends LitElement {
  static properties = { foo: { type: String } };
  foo = "Default";

  @property()
  bar = "Default";
}
```

- 在字段上添加 `declare` 关键字，并将字段的初始化器放在构造函数中。

```ts
class MyElement extends LitElement {
  declare foo: string;
  static properties = { foo: { type: String } };
  constructor() {
    super();
    this.foo = "Default";
  }
}
```

- 在字段上添加 `accessor` 关键字以使用[自动访问器](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#auto-accessors-in-classes)。

```ts
class MyElement extends LitElement {
  static properties = { foo: { type: String } };
  accessor foo = "Default";

  @property()
  accessor bar = "Default";
}
```

### 属性选项

选项对象可以具有以下属性：

<dl>
<dt>

`attribute`

</dt>
<dd>

属性是否与特性关联，或关联特性的自定义名称。默认值：true。如果 `attribute` 为 false，则 `converter`、`reflect` 和 `type` 选项将被忽略。有关更多信息，请参阅[设置特性名称](#observed-attributes)。

</dd>
<dt>

`converter`

</dt>
<dd>

用于在属性和特性之间转换的[自定义转换器](#conversion-converter)。如果未指定，则使用[默认特性转换器](#conversion-type)。

</dd>
<dt>

`hasChanged`

</dt>
<dd>

每当设置属性时调用的函数，用于确定属性是否已更改并应触发更新。如果未指定，LitElement 使用严格不等式检查（`newValue !== oldValue`）来确定属性值是否已更改。
有关更多信息，请参阅[自定义更改检测](#haschanged)。

</dd>
<dt>

`noAccessor`

</dt>
<dd>

设置为 true 以避免生成默认的属性访问器。此选项很少需要。默认值：false。有关更多信息，请参阅[阻止 Lit 生成属性访问器](#accessors-noaccessor)。

</dd>
<dt>

`reflect`

</dt>
<dd>

属性值是否反射回关联的特性。默认值：false。有关更多信息，请参阅[启用特性反射](#reflected-attributes)。

</dd>
<dt>

`state`

</dt>
<dd>

设置为 true 以将属性声明为*内部响应式状态*。内部响应式状态像公共响应式属性一样触发更新，但 Lit 不会为其生成特性，用户不应从组件外部访问它。等同于使用 `@state` 装饰器。默认值：false。有关更多信息，请参阅[内部响应式状态](#internal-reactive-state)。

</dd>
<dt>

`type`

</dt>
<dd>

在将字符串值的特性转换为属性时，Lit 的默认特性转换器会将字符串解析为给定的类型，反之亦然，当将属性反射到特性时。如果设置了 `converter`，此字段将传递给转换器。如果未指定 `type`，默认转换器将其视为 `type: String`。参见[使用默认转换器](#conversion-type)。

使用 TypeScript 时，此字段通常应与为字段声明的 TypeScript 类型匹配。但是，`type` 选项由 Lit 的*运行时*用于字符串序列化/反序列化，不应与*类型检查*机制混淆。

</dd>
<dt id="use-default">

`useDefault`

</dt>
<dd>

设置为 true 以防止在 `reflect` 设置为 true 时对默认值进行初始特性反射，并在移除对应特性时将属性重置为其默认值。

默认值是在构造函数中或使用[自动访问器](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#auto-accessors-in-classes)设置的属性初始值。此值保留在内存中，因此对于非原始 Object/Array 属性，避免设置 `useDefault: true` 是一种好的做法。有关更多信息，请参阅[启用特性反射](#reflected-attributes)和[反射特性时的最佳实践](#best-practices-when-reflecting-attributes)。

</dd>

省略选项对象或指定空的选项对象等同于指定所有选项的默认值。

## 内部响应式状态

*内部响应式状态*是指不属于组件公共 API 的响应式属性。这些状态属性没有对应的特性，也不打算从组件外部使用。内部响应式状态应由组件本身设置。

使用 `@state` 装饰器来声明内部响应式状态：

```ts
@state()
protected _active = false;
```

使用静态 `properties` 类字段，你可以通过使用 `state: true` 选项来声明内部响应式状态。

```js
static properties = {
  _active: {state: true}
};

constructor() {
  this._active = false;
}
```

内部响应式状态不应从组件外部引用。在 TypeScript 中，这些属性应标记为 private 或 protected。我们还建议对 JavaScript 用户使用前导下划线（`_`）等约定来标识私有或受保护的属性。

内部响应式状态的工作方式与公共响应式属性完全相同，只是没有与属性关联的特性。对于内部响应式状态，你可以指定的唯一选项是 `hasChanged` 函数。

`@state` 装饰器还可以作为代码压缩器的提示，表明属性名称可以在压缩期间更改。

## 属性更改时会发生什么 {#when-properties-change}

属性更改可以触发响应式更新周期，使组件重新渲染其模板。

当属性更改时，会发生以下序列：

1.  调用属性的 setter。
1.  setter 调用组件的 `requestUpdate` 方法。
1.  比较属性的旧值和新值。
    - 默认情况下 Lit 使用严格不等式测试来确定值是否已更改（即 `newValue !== oldValue`）。
    - 如果属性有 `hasChanged` 函数，则使用属性的旧值和新值调用它。
1.  如果检测到属性更改，则异步调度一次更新。如果已经调度了更新，则只执行一次更新。
1.  调用组件的 `update` 方法，将更改的属性反射到特性并重新渲染组件的模板。

请注意，如果你修改对象或数组属性，它不会触发更新，因为对象本身没有更改。有关更多信息，请参阅[修改对象和数组属性](#mutating-properties)。

有许多方法可以接入和修改响应式更新周期。有关更多信息，请参阅[响应式更新周期](/docs/v3/components/lifecycle/#reactive-update-cycle)。

有关属性更改检测的更多信息，请参阅[自定义更改检测](#haschanged)。

### 修改对象和数组属性 {#mutating-properties}

修改对象或数组不会更改对象引用，因此不会触发更新。你可以通过以下两种方式之一处理对象和数组属性：

- 不可变数据模式。将对象和数组视为不可变的。例如，要从 `myArray` 中移除一个项目，构造一个新数组：

  ```js
  this.myArray = this.myArray.filter((_, i) => i !== indexToRemove);
  ```

  虽然这个示例很简单，但通常使用像 [Immer](https://immerjs.github.io/immer/) 这样的库来管理不可变数据会很有帮助。这可以帮助避免设置深层嵌套对象时的棘手样板代码。

- 手动触发更新。修改数据并调用 `requestUpdate()` 直接触发更新。例如：

  ```js
  this.myArray.splice(indexToRemove, 1);
  this.requestUpdate();
  ```

  当不带参数调用时，`requestUpdate()` 调度一次更新，不调用 `hasChanged()` 函数。但请注意 `requestUpdate()` 只会导致*当前*组件更新。也就是说，如果一个组件使用上面显示的代码，并且该组件将 `this.myArray` 传递给子组件，子组件将检测到数组引用没有更改，因此不会更新。

通常，对大多数应用程序来说，使用不可变对象的自顶向下数据流是最好的。它确保每个需要渲染新值的组件都会这样做（并且尽可能高效，因为数据树中未更改的部分不会导致依赖它们的组件更新）。

直接修改数据并调用 `requestUpdate()` 应被视为高级用例。在这种情况下，你（或其他系统）需要识别使用被修改数据的所有组件，并对每个组件调用 `requestUpdate()`。当这些组件分布在整个应用程序中时，这变得难以管理。不稳健地这样做意味着你可能修改了在应用程序两个部分中渲染的对象，但只有一个部分更新。

在简单的情况下，当你知道给定的数据仅在单个组件中使用时，如果你愿意，修改数据并调用 `requestUpdate()` 应该是安全的。

## 特性 {#attributes}

虽然属性非常适合接收 JavaScript 数据作为输入，但特性是 HTML 允许从*标记*配置元素的标准方式，无需使用 JavaScript 来设置属性。为其响应式属性同时提供属性和特性接口是 Lit 组件可以在各种环境中使用的关键方式，包括那些不使用客户端模板引擎渲染的环境，例如从 CMS 提供的静态 HTML 页面。

默认情况下，Lit 为每个公共响应式属性设置一个对应的被观察特性，并在特性更改时更新属性。属性值也可以选择性地*反射*（写回特性）。

虽然元素属性可以是任何类型，但特性始终是字符串。这影响了非字符串属性的[被观察特性](#observed-attributes)和[反射特性](#reflected-attributes)：

- 要观察一个特性（从特性设置属性），特性值必须从字符串转换以匹配属性类型。

- 要反射一个特性（从属性设置特性），属性值必须转换为字符串。

暴露特性的布尔属性应默认为 false。有关更多信息，请参阅[布尔特性](#boolean-attributes)。

### 设置特性名称 {#observed-attributes}

默认情况下，Lit 为所有公共响应式属性创建一个对应的被观察特性。被观察特性的名称是属性名称的小写形式：

{% switchable-sample %}

```ts
// 被观察特性名称为 "myvalue"
@property({ type: Number })
myValue = 0;
```

```js
// 被观察特性名称为 "myvalue"
static properties = {
  myValue: { type: Number },
};

constructor() {
  super();
  this.myValue = 0;
}
```

{% endswitchable-sample %}

要创建具有不同名称的被观察特性，将 `attribute` 设置为字符串：

{% switchable-sample %}

```ts
// 被观察特性将命名为 my-name
@property({ attribute: 'my-name' })
myName = 'Ogden';
```

```js
// 被观察特性将命名为 my-name
static properties = {
  myName: { attribute: 'my-name' },
};

constructor() {
  super();
  this.myName = 'Ogden'
}
```

{% endswitchable-sample %}

要阻止为属性创建被观察特性，将 `attribute` 设置为 `false`。该属性不会从标记中的特性初始化，特性更改也不会影响它。

{% switchable-sample %}

```ts
// 此属性没有被观察特性
@property({ attribute: false })
myData = {};
```

```js
// 此属性没有被观察特性
static properties = {
  myData: { attribute: false },
};

constructor() {
  super();
  this.myData = {};
}
```

{% endswitchable-sample %}

内部响应式状态永远没有关联的特性。

被观察特性可用于从标记中提供属性的初始值。例如：

```html
<my-element myvalue="99"></my-element>
```

### 使用默认转换器 {#conversion-type}

Lit 有一个默认转换器，处理 `String`、`Number`、`Boolean`、`Array` 和 `Object` 属性类型。

要使用默认转换器，在属性声明中指定 `type` 选项：

{% switchable-sample %}

```ts
// 使用默认转换器
@property({ type: Number })
count = 0;
```

```js
// 使用默认转换器
static properties = {
  count: { type: Number },
};

constructor() {
  super();
  this.count = 0;
}
```

{% endswitchable-sample %}

如果你没有为属性指定类型或自定义转换器，它的行为就像你指定了 `type: String` 一样。

下表显示了默认转换器如何处理每种类型的转换。

从特性到属性

| 类型              | 转换                                                                          |
| :---------------- | :---------------------------------------------------------------------------- |
| `String`          | 如果元素具有对应的特性，将属性设置为特性值。                                  |
| `Number`          | 如果元素具有对应的特性，将属性设置为 `Number(attributeValue)`。               |
| `Boolean`         | 如果元素具有对应的特性，将属性设置为 true。<br>如果没有，将属性设置为 false。 |
| `Object`、`Array` | 如果元素具有对应的特性，将属性值设置为 `JSON.parse(attributeValue)`。         |

对于除 `Boolean` 以外的任何情况，如果元素没有对应的特性，属性保持其默认值，如果没有设置默认值则为 `undefined`。

从属性到特性

| 类型               | 转换                                                                                                                |
| :----------------- | :------------------------------------------------------------------------------------------------------------------ |
| `String`、`Number` | 如果属性已定义且非 null，将特性设置为属性值。<br>如果属性为 null 或 undefined，移除特性。                           |
| `Boolean`          | 如果属性为真值，创建特性并将其值设置为空字符串。<br>如果属性为假值，移除特性                                        |
| `Object`、`Array`  | 如果属性已定义且非 null，将特性设置为 `JSON.stringify(propertyValue)`。<br>如果属性为 null 或 undefined，移除特性。 |

### 提供自定义转换器 {#conversion-converter}

你可以在属性声明中使用 `converter` 选项指定自定义属性转换器：

```js
myProp: {
  converter: // 自定义属性转换器
}
```

`converter` 可以是对象或函数。如果是对象，它可以有 `fromAttribute` 和 `toAttribute` 的键：

```js
prop1: {
  converter: {
    fromAttribute: (value, type) => {
      // `value` 是一个字符串
      // 将其转换为 `type` 类型的值并返回
    },
    toAttribute: (value, type) => {
      // `value` 是 `type` 类型的
      // 将其转换为字符串并返回
    }
  }
}
```

如果 `converter` 是函数，它将被用作 `fromAttribute` 的替代：

```js
myProp: {
  converter: (value, type) => {
    // `value` 是一个字符串
    // 将其转换为 `type` 类型的值并返回
  };
}
```

如果没有为反射特性提供 `toAttribute` 函数，则使用默认转换器将特性设置为属性值。

如果 `toAttribute` 返回 `null` 或 `undefined`，特性将被移除。

### 布尔特性 {#boolean-attributes}

对于要从特性配置的布尔属性，它必须默认为 false。如果默认为 true，你无法从标记中将其设置为 false，因为特性的存在（无论有没有值）等同于 true。这是 Web 平台中特性的标准行为。

如果此行为不适合你的用例，有几个选项：

- 更改属性名称使其默认为 false。例如，Web 平台使用 `disabled` 特性（默认为 false），而不是 `enabled`。

- 改用字符串值或数字值的特性。

### 启用特性反射 {#reflected-attributes}

将 `reflect` 设置为 true 会配置属性，使其在每次更改时，其值都反射到其[对应的特性](#observed-attributes)。反射特性对于序列化元素状态很有用，因为它们对 CSS 和 `querySelector` 等 DOM API 可见。

将 `useDefault` 设置为 true 可以防止属性的默认值初始时反射到其[对应的特性](#observed-attributes)。所有后续更改都会被反射；如果特性被移除，属性将重置为其默认值。

这与 Web 平台对 `id` 等特性的行为一致。元素的 `id` 属性的默认值是 `''`（空字符串），初始时它没有 `id` 特性，但如果设置了 `id` 属性（即使设置为空字符串），相应的 `id` 特性会被反射。如果 `id` 特性被移除，元素的 `id` 属性会被设置回其初始值 `''`。

例如：

```js
// 属性 "active" 的值将反射到特性 "active"
active: {reflect: true}
// 属性 "variant" 的值将反射，但 "variant" 特性
// 不会初始设置为属性的默认值。
variant: {reflect: true, useDefault: true}
```

当属性更改时，Lit 按照[使用默认转换器](#conversion-type)或[提供自定义转换器](#conversion-converter)中所述设置对应的特性值。

{% playground-example "properties/attributereflect" "my-element.ts" %}

<div class="alert alert-info">

Lit 在更新期间跟踪反射状态。你可能已经意识到，如果属性更改反射到特性，而特性更改又更新属性，这有可能创建无限循环。但是，Lit 会跟踪属性和特性何时被专门设置，以防止这种情况发生。

</div>

### 反射特性时的最佳实践 {#best-practices-when-reflecting-attributes}

为确保元素按预期运行并表现良好，在反射特性时请尝试遵循以下最佳实践：

- 特性通常应被视为元素所有者对元素的输入，而不是由元素本身控制的，因此将属性反射到特性应谨慎进行。考虑使用 [`:state` 伪选择器](https://wicg.github.io/custom-state-pseudo-class/)和[无障碍对象模型](https://wicg.github.io/aom/spec/)作为替代。

- 反射属性通常也应设置 `useDefault: true`，因为这可以防止元素自发地产生用户未设置的特性，并有助于匹配预期的平台行为。

- 不建议反射 object 或 array 类型的属性。这可能导致大对象序列化到 DOM，当使用 `useDefault` 时可能导致性能下降和消耗过多内存。
- 属性装饰器不会更改分配给响应式属性的任何值，这被认为是自定义访问器的最佳实践。有时原生元素会将属性限制为某些有效值，例如，如果将无效值分配给属性，属性将被设置为默认值。`useDefault: true` 不会这样做——它只在特性被移除时恢复默认值。如果你想在属性赋值时更改属性值，请定义并装饰自定义属性 setter。

## 自定义属性访问器 {#accessors}

默认情况下，LitElement 为所有响应式属性生成一个 getter/setter 对。每当你设置属性时都会调用 setter：

{% switchable-sample %}

```ts
// 声明一个属性
@property()
greeting: string = 'Hello';
...
// 之后，设置属性
this.greeting = 'Hola'; // 调用 greeting 生成的属性访问器
```

```js
// 声明一个属性
static properties = {
  greeting: {},
}
constructor() {
  this.super();
  this.greeting = 'Hello';
}
...
// 之后，设置属性
this.greeting = 'Hola'; // 调用 greeting 生成的属性访问器
```

{% endswitchable-sample %}

生成的访问器自动调用 `requestUpdate()`，如果更新尚未开始则启动更新。

### 创建自定义属性访问器 {#accessors-custom}

要指定属性的获取和设置方式，你可以定义自己的 getter/setter 对。例如：

{% switchable-sample %}

```ts
private _prop = 0;

@property()
set prop(val: number) {
  this._prop = Math.floor(val);
}

get prop() { return this._prop; }
```

```js
static properties = {
  prop: {},
};

_prop = 0;

set prop(val) {
  this._prop = Math.floor(val);
}

get prop() { return this._prop; }
```

{% endswitchable-sample %}

要在 `@property` 或 `@state` 装饰器中使用自定义属性访问器，请将装饰器放在 setter 上，如上所示。`@property` 或 `@state` 装饰的 setter 会调用 `requestUpdate()`。

在大多数情况下，你不需要创建自定义属性访问器。要从现有属性计算值，我们建议使用 [`willUpdate`](/docs/v3/components/lifecycle/#willupdate) 回调，它允许你在更新周期中设置值而不会触发额外的更新。要在元素更新后执行自定义操作，我们建议使用 [`updated`](/docs/v3/components/lifecycle/#updated) 回调。自定义 setter 可以在需要同步验证用户设置的任何值的罕见情况下使用。

如果你的类为属性定义了自己的访问器，Lit 不会用生成的访问器覆盖它们。如果你的类没有为属性定义访问器，Lit 会生成它们，即使超类已经定义了属性或访问器。

### 阻止 Lit 生成属性访问器 {#accessors-noaccessor}

在罕见的情况下，子类可能需要更改或添加存在于其超类上的属性的属性选项。

要阻止 Lit 生成覆盖超类定义的访问器的属性访问器，在属性声明中将 `noAccessor` 设置为 `true`：

```js
static properties = {
  myProp: { type: Number, noAccessor: true }
};
```

定义自己的访问器时不需要设置 `noAccessor`。

## 自定义更改检测 {#haschanged}

所有响应式属性都有一个函数 `hasChanged()`，在设置属性时调用。

`hasChanged` 比较属性的旧值和新值，并评估属性是否已更改。如果 `hasChanged()` 返回 true，Lit 会启动元素更新（如果尚未调度）。有关更新的更多信息，请参阅[响应式更新周期](/docs/v3/components/lifecycle/#reactive-update-cycle)。

`hasChanged()` 的默认实现使用严格不等式比较：如果 `newVal !== oldVal`，`hasChanged()` 返回 `true`。

要为属性自定义 `hasChanged()`，请将其指定为属性选项：

{% switchable-sample %}

```ts
@property({
  hasChanged(newVal: string, oldVal: string) {
    return newVal?.toLowerCase() !== oldVal?.toLowerCase();
  }
})
myProp: string | undefined;
```

```js
static properties = {
  myProp: {
    hasChanged(newVal, oldVal) {
      return newVal?.toLowerCase() !== oldVal?.toLowerCase();
    }
  }
};
```

{% endswitchable-sample %}

在以下示例中，`hasChanged()` 仅对奇数值返回 true。

{% playground-example "properties/haschanged" "my-element.ts" %}
