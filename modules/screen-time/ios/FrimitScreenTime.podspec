Pod::Spec.new do |s|
  s.name           = 'FrimitScreenTime'
  s.version        = '1.0.0'
  s.summary        = 'Frimit device usage collection'
  s.description    = 'Family Controls 기반 그룹별 사용량 수집 모듈'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  # Family Controls는 iOS 전용이라 tvOS는 지원 대상에서 뺀다.
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
