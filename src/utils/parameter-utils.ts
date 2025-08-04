import { Parameter } from '@nanograph/sdk'

export const getParameterValue = <T>(parameters: Parameter[], name: string, defaultValue: T): T => {
  const param = parameters.find(p => p.name === name)
  return (param?.value as T) ?? defaultValue
}

export const getRequiredParameterValue = <T>(parameters: Parameter[], name: string): T => {
  const param = parameters.find(p => p.name === name)
  if (!param?.value) {
    throw new Error(`Required parameter '${name}' is missing`)
  }
  return param.value as T
} 