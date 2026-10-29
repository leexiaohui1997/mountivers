import BaseRole from '../utils/role/base.js'

export default class TestRole extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true

  async run() {
    console.log('test')
    await new Promise((r) => setTimeout(r, 2000))
  }
}
