export default defineBackground(() => {
  console.log('OneBookmark background service started', { id: browser.runtime.id })
})
