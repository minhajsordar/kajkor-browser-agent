// stores/apiStore.js
import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

// Define API response validators
const apiValidators = {
  '/users': {
    tags: ['user'],
    validator: (data) => {
      if (!Array.isArray(data)) throw new Error('Expected array for users')
      data.forEach(user => {
        if (typeof user.id !== 'number') throw new Error('User missing id')
        if (typeof user.name !== 'string') throw new Error('User missing name')
      })
    }
  },
  '/posts': {
    tags: ['post'],
    validator: (data) => {
      if (!Array.isArray(data)) throw new Error('Expected array for posts')
      data.forEach(post => {
        if (typeof post.id !== 'number') throw new Error('Post missing id')
        if (typeof post.title !== 'string') throw new Error('Post missing title')
      })
    }
  }
  // Add more API validators as needed
}

export const useApiStore = defineStore('api', () => {
  const cache = ref({})
  const loading = ref({})
  const errors = ref({})

  // Get validator for a specific path
  const getValidator = (path) => {
    return apiValidators[path] || {
      tags: ['default'],
      validator: () => {} // No validation by default
    }
  }

  // Main query function
  const query = async (path, options = {}) => {
    const { forceRefresh = false, tags = [] } = options
    const validator = getValidator(path)
    const allTags = [...validator.tags, ...tags]

    // Return cached data if available and not forcing refresh
    if (cache.value[path] && !forceRefresh) {
      return {
        data: cache.value[path],
        isLoading: false,
        error: null
      }
    }

    try {
      // Set loading state
      loading.value[path] = true
      errors.value[path] = null

      // Make API call
      const response = await axios.get(path)

      // Validate response
      validator.validator(response.data)

      // Update cache
      cache.value[path] = response.data

      // Invalidate cache for related tags if needed
      if (options.invalidateTags) {
        Object.keys(cache.value).forEach(cachedPath => {
          const cachedValidator = getValidator(cachedPath)
          if (cachedValidator.tags.some(tag => options.invalidateTags.includes(tag))) {
            delete cache.value[cachedPath]
          }
        })
      }

      return {
        data: response.data,
        isLoading: false,
        error: null
      }
    } catch (error) {
      errors.value[path] = error
      return {
        data: null,
        isLoading: false,
        error: error.message
      }
    } finally {
      loading.value[path] = false
    }
  }

  // Mutation function for POST/PUT/PATCH/DELETE
  const mutation = async (method, path, data, options = {}) => {
    const { tags = [] } = options
    const validator = getValidator(path)
    const allTags = [...validator.tags, ...tags]

    try {
      loading.value[path] = true
      errors.value[path] = null

      const response = await axios({
        method,
        url: path,
        data
      })

      // Validate response if validator exists
      if (response.data) {
        validator.validator(response.data)
      }

      // Update cache if this is a GET-able endpoint
      if (method.toLowerCase() === 'get') {
        cache.value[path] = response.data
      }

      // Invalidate cache for related tags
      if (options.invalidateTags) {
        Object.keys(cache.value).forEach(cachedPath => {
          const cachedValidator = getValidator(cachedPath)
          if (cachedValidator.tags.some(tag => options.invalidateTags.includes(tag))) {
            delete cache.value[cachedPath]
          }
        })
      }

      return {
        data: response.data,
        isLoading: false,
        error: null
      }
    } catch (error) {
      errors.value[path] = error
      return {
        data: null,
        isLoading: false,
        error: error.message
      }
    } finally {
      loading.value[path] = false
    }
  }

  // Helper methods
  const get = (path, options) => query(path, options)
  const post = (path, data, options) => mutation('post', path, data, options)
  const put = (path, data, options) => mutation('put', path, data, options)
  const patch = (path, data, options) => mutation('patch', path, data, options)
  const del = (path, options) => mutation('delete', path, null, options)

  // Get loading state for a path
  const isLoading = (path) => !!loading.value[path]

  // Get error for a path
  const getError = (path) => errors.value[path]

  // Clear cache for specific tags
  const invalidateTags = (tags) => {
    Object.keys(cache.value).forEach(cachedPath => {
      const validator = getValidator(cachedPath)
      if (validator.tags.some(tag => tags.includes(tag))) {
        delete cache.value[cachedPath]
      }
    })
  }

  return {
    cache,
    loading,
    errors,
    query,
    get,
    post,
    put,
    patch,
    delete: del,
    isLoading,
    getError,
    invalidateTags
  }
})