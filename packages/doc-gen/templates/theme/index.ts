import DefaultTheme from 'vitepress/theme'
import BehaviorFlow from './components/BehaviorFlow.vue'
import StateMachine from './components/StateMachine.vue'
import CodeLink from './components/CodeLink.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('BehaviorFlow', BehaviorFlow)
    app.component('StateMachine', StateMachine)
    app.component('CodeLink', CodeLink)
  }
}
