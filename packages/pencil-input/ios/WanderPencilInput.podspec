# Wander — Zhich, Yu, Justin
# CocoaPods spec for the native Apple Pencil input view.
Pod::Spec.new do |s|
  s.name           = 'WanderPencilInput'
  s.version        = '0.1.0'
  s.summary        = 'Apple Pencil input for the Wander canvas'
  s.description    = 'Transparent touch view that reports Pencil pressure, tilt, coalesced and predicted samples.'
  s.author         = 'Zhich, Yu, Justin'
  s.homepage       = 'https://github.com/ZhichGaming/wander'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
