import { describe, expect, it } from 'vitest'
import { validateCloudPawsCommand } from './cloudPaws'
describe('Cloud Paws trusted command boundary', () => {
 it('strips forged identity, position, and token fields', () => {
  expect(validateCloudPawsCommand({action:'create', animal:'fox', name:'forged', userId:2, position:{x:999},token:'secret'})).toEqual({action:'create',animal:'fox'})
 })
 it('rejects malformed input and accepts ordinary mouse-jump input', () => {
  expect(() => validateCloudPawsCommand({action:'input',seq:1,input:{x:Infinity,z:0,jump:true,sprint:false}})).toThrow()
  expect(() => validateCloudPawsCommand({action:'join',code:'<script>'})).toThrow()
  expect(validateCloudPawsCommand({action:'input',seq:4,input:{x:0,z:-1,jump:true,sprint:false}}).input?.jump).toBe(true)
 })
})
