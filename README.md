# LHTML

An LHTML file is a web application with the ability to save itself.  For a demo, watch this video:

XXX

# Making LHTML files

To create an LHTML file, create an `index.html` file:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My LHTML file</title>
</head>
<body>
    Hello
</body>
</html>
```

then zip it up.  On Linux/macOS do:

```bash
zip myfirst.lhtml index.html
```

Now you can open the file, save it, email it, copy it, etc...

## Resources

If you want to include CSS or JavaScript files, include them in the zip and reference them with relative paths.  For example:

```html
<head>
  <link type="text/css" rel="stylesheet" href="style.css" media="screen,projection">
  ...
</head>
...
```

```bash
zip myfirst.lhtml index.html style.css
```

## External Resources

LHTML files are not allowed to access resources over the network.  This is intentional for security reasons.

## API

LHTML viewers provide a small JavaScript API to `index.html` files described here:

### `defaultSaver`

This is the saving function used by default (if none is provided by calling `registerSaver`).  It will take the current state of `index.html` and overwrite `index.html` within the LHTML zip.

For usage, see `registerSaver`'s usage.

### `enableFormSaving()`

A common use case for LHTML files is to email a form to be filled out.  If you don't want to use a fancy framework (like React or Angular) you can call this function to enable basic HTML form saving.

On documents where this is called, inputs will retain their values when saved.

Usage:

```html
<body>
    <script>window.LHTML && LHTML.enableFormSaving()</script>
    Name: <input name="name">
    Email: <input type="email" name="email">
    Favorite color: <select>
        <option>Red</option>
        <option>Blue</option>
    </select>
</body>
```

### `on(event, handler)`

Listen for one of these events:

- `saved` - emitted after the document has been saved.  The handler is called with no arguments.

Usage:

```html
LHTML.on('saved', function() {
    console.log('The file was saved!');
})
```

### `registerSaver(func)`

Registers a function to be called when the application is to be saved.  By default `LHTML.defaultSaver` is used.

Usage:

```html
<script>
// Register a saver that will save index.html in its current state
// and write some data to somedata.json within the LHTML zip.
LHTML.registerSaver(function() {
    var files = LHTML.defaultSaver();
    files['somedata.json'] = '{"foo": "bar"}';
    return files;
})
</script>
```

### `save()`

Saves the current file.  See `registerSaver` for more info.

Usage:

```html
<script>
LHTML.save().then(function() {
    console.log('saved');
})
</script>
```



# Development

    npm install
    node_modules/.bin/electron .

# Packaging

    npm install
    ./build.sh
