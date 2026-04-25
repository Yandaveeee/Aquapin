import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  Keyboard,
  ScrollView,
  Image,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password: string): string | null => {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  return null;
};

interface FormErrors {
  email?: string;
  password?: string;
}

type FocusField = 'email' | 'password' | null;

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const { signIn, signUp } = useAuth();

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    if (!cooldownUntil) {
      return;
    }

    setCurrentTime(Date.now());
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    if (cooldownUntil && cooldownUntil <= currentTime) {
      setCooldownUntil(null);
    }
  }, [cooldownUntil, currentTime]);

  const animateModeSwitch = useCallback(
    (toSignUp: boolean) => {
      Keyboard.dismiss();
      setFocusedField(null);

      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
        easing: Easing.ease,
      }).start(() => {
        setIsSignUp(toSignUp);
        setErrors({});
        setPassword('');
        setShowPassword(false);

        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.ease,
        }).start();
      });

      Animated.timing(iconRotate, {
        toValue: toSignUp ? 1 : 0,
        duration: 350,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    },
    [fadeAnim, iconRotate]
  );

  const animateButtonPress = useCallback(
    (pressed: boolean) => {
      Animated.spring(buttonScale, {
        toValue: pressed ? 0.97 : 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }).start();
    },
    [buttonScale]
  );

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(normalizedEmail)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (isSignUp) {
      const passwordError = validatePassword(password);
      if (passwordError) newErrors.password = passwordError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (loading || submitInFlightRef.current) {
      return;
    }

    Keyboard.dismiss();
    setFocusedField(null);

    if (isCooldownActive) {
      return;
    }

    if (!validateForm()) return;

    const normalizedEmail = email.trim().toLowerCase();

    submitInFlightRef.current = true;
    setLoading(true);
    try {
      if (isSignUp) {
        const { error, signedIn } = await signUp(normalizedEmail, password);
        if (error) {
          if (error.isRateLimit) {
            setCooldownUntil(Date.now() + (error.retryAfterSeconds || 60) * 1000);
          }
          Alert.alert('Registration Error', error.message);
        } else if (!signedIn) {
          Alert.alert(
            'Account Created',
            'Your account was created. Open the verification email on this device; the link should return to AquaPin. If it still opens localhost, add aquapin://auth/callback to Supabase Auth Redirect URLs.',
            [
            {
              text: 'OK',
              onPress: () => animateModeSwitch(false),
              style: 'default',
            },
            ]
          );
        }
      } else {
        const { error } = await signIn(normalizedEmail, password);
        if (error) {
          if (error.isRateLimit) {
            setCooldownUntil(Date.now() + (error.retryAfterSeconds || 60) * 1000);
          }
          Alert.alert('Login Error', error.message);
        }
      }
    } finally {
      submitInFlightRef.current = false;
      setLoading(false);
    }
  };

  const getPasswordStrength = (): { strength: number; color: string; label: string } => {
    if (password.length === 0) return { strength: 0, color: '#334155', label: '' };

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { strength: 0.33, color: '#ef4444', label: 'Weak' };
    if (score <= 4) return { strength: 0.66, color: '#f59e0b', label: 'Medium' };
    return { strength: 1, color: '#10b981', label: 'Strong' };
  };

  const passwordStrength = getPasswordStrength();
  const normalizedEmail = email.trim();
  const signUpPasswordError = isSignUp ? validatePassword(password) : null;
  const remainingCooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - currentTime) / 1000)) : 0;
  const isCooldownActive = remainingCooldownSeconds > 0;
  const canSubmit =
    !loading &&
    !isCooldownActive &&
    validateEmail(normalizedEmail) &&
    password.length > 0 &&
    (!isSignUp || !signUpPasswordError);

  const iconRotation = iconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundLayer} pointerEvents="none">
        <View style={styles.orbTop} />
        <View style={styles.orbBottom} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <Animated.View style={[styles.iconCircle, { transform: [{ rotate: iconRotation }] }]}>
                <Image
                  source={require('../../assets/icon.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </Animated.View>
              <View>
                <Text style={styles.title}>AquaPin</Text>
                <Text style={styles.subtitle}>Field Operations</Text>
              </View>
            </View>
            <Text style={styles.headerBlurb}>
              Map ponds, log farm events, and sync data from anywhere.
            </Text>
            <View style={styles.headerMetaRow}>
              <View style={styles.headerMetaPill}>
                <Ionicons name="cloud-done-outline" size={14} color="#0b6aa8" />
                <Text style={styles.headerMetaText}>Offline-ready</Text>
              </View>
              <View style={styles.headerMetaPill}>
                <Ionicons name="shield-checkmark-outline" size={14} color="#0b8f6a" />
                <Text style={styles.headerMetaText}>Secure sync</Text>
              </View>
            </View>
          </View>

          <Animated.View style={[styles.formCard, { opacity: fadeAnim }]}>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[styles.toggleButton, !isSignUp && styles.toggleButtonActive]}
                onPress={() => {
                  if (isSignUp) {
                    animateModeSwitch(false);
                  }
                }}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={[styles.toggleText, !isSignUp && styles.toggleTextActive]}>Log In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, isSignUp && styles.toggleButtonActive]}
                onPress={() => {
                  if (!isSignUp) {
                    animateModeSwitch(true);
                  }
                }}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={[styles.toggleText, isSignUp && styles.toggleTextActive]}>Register</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.formTitle}>{isSignUp ? 'Create Account' : 'Welcome Back'}</Text>
            <Text style={styles.formSubtitle}>
              {isSignUp
                ? 'Create your field staff account and start immediately.'
                : 'Sign in to continue to your field dashboard.'}
            </Text>
            {isCooldownActive && (
              <View style={styles.noticeCard}>
                <Ionicons name="time-outline" size={18} color="#b45309" />
                <View style={styles.noticeCopy}>
                  <Text style={styles.noticeTitle}>Please wait before trying again</Text>
                  <Text style={styles.noticeText}>
                    Too many auth attempts were sent. Try again in {remainingCooldownSeconds}s.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <Pressable
                style={[
                  styles.inputWrapper,
                  focusedField === 'email' && styles.inputWrapperFocused,
                  errors.email && styles.inputWrapperError,
                ]}
                onPress={() => emailInputRef.current?.focus()}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={errors.email ? '#f87171' : focusedField === 'email' ? '#42c7ff' : '#7f95b7'}
                  style={styles.leftIcon}
                />
                <TextInput
                  ref={emailInputRef}
                  style={styles.input}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor="#68809f"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  editable={!loading}
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField((prev) => (prev === 'email' ? null : prev))}
                  autoCorrect={false}
                  spellCheck={false}
                  showSoftInputOnFocus
                />
                {normalizedEmail.length > 0 && validateEmail(normalizedEmail) && (
                  <Ionicons name="checkmark-circle" size={20} color="#34d399" style={styles.trailingIcon} />
                )}
              </Pressable>
              {errors.email && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={14} color="#f87171" />
                  <Text style={styles.errorText}>{errors.email}</Text>
                </View>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <Pressable
                style={[
                  styles.inputWrapper,
                  focusedField === 'password' && styles.inputWrapperFocused,
                  errors.password && styles.inputWrapperError,
                ]}
                onPress={() => passwordInputRef.current?.focus()}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={errors.password ? '#f87171' : focusedField === 'password' ? '#42c7ff' : '#7f95b7'}
                  style={styles.leftIcon}
                />
                <TextInput
                  ref={passwordInputRef}
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="••••••••"
                  placeholderTextColor="#68809f"
                  secureTextEntry={!showPassword}
                  autoComplete={isSignUp ? 'new-password' : 'password'}
                  textContentType={isSignUp ? 'newPassword' : 'password'}
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField((prev) => (prev === 'password' ? null : prev))}
                  autoCorrect={false}
                  spellCheck={false}
                  showSoftInputOnFocus
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={styles.eyeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#7f95b7" />
                </TouchableOpacity>
              </Pressable>
              {errors.password && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={14} color="#f87171" />
                  <Text style={styles.errorText}>{errors.password}</Text>
                </View>
              )}

              {isSignUp && password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBarContainer}>
                    <View
                      style={[
                        styles.strengthBar,
                        {
                          width: `${passwordStrength.strength * 100}%`,
                          backgroundColor: passwordStrength.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                    {passwordStrength.label}
                  </Text>
                </View>
              )}

              {isSignUp && (
                <View style={styles.requirementsContainer}>
                  <RequirementItem met={password.length >= 8} text="At least 8 characters" />
                  <RequirementItem met={/[A-Z]/.test(password)} text="One uppercase letter" />
                  <RequirementItem met={/[0-9]/.test(password)} text="One number" />
                </View>
              )}
            </View>

            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  !canSubmit && styles.actionButtonInactive,
                  (loading || isCooldownActive) && styles.actionButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={loading || isCooldownActive}
                activeOpacity={0.85}
                onPressIn={() => animateButtonPress(true)}
                onPressOut={() => animateButtonPress(false)}
              >
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.loadingText}>{isSignUp ? 'Creating account...' : 'Signing in...'}</Text>
                  </View>
                ) : (
                  <View style={styles.buttonContent}>
                    <Text style={styles.actionButtonText}>
                      {isCooldownActive
                        ? `Try Again in ${remainingCooldownSeconds}s`
                        : isSignUp
                          ? 'Create Account'
                          : 'Sign In'}
                    </Text>
                    <Ionicons
                      name={isCooldownActive ? 'time-outline' : isSignUp ? 'arrow-forward' : 'log-in-outline'}
                      size={20}
                      color="#fff"
                      style={styles.buttonIcon}
                    />
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>

            <View style={styles.helpContainer}>
              <Text style={styles.helpText}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (!loading) {
                    animateModeSwitch(!isSignUp);
                  }
                }}
                disabled={loading}
              >
                <Text style={styles.helpLink}>{isSignUp ? 'Sign in' : 'Register'}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          <View style={styles.footer}>
            <View style={styles.footerBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#34d399" />
              <Text style={styles.footerBrand}>AquaPin Secure</Text>
            </View>
            <Text style={styles.footerText}>Offline-ready • Encrypted sync • Field-first workflow</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RequirementItem({ met, text }: { met: boolean; text: string }) {
  return (
    <View style={styles.requirementItem}>
      <Ionicons name={met ? 'checkmark-circle' : 'ellipse-outline'} size={13} color={met ? '#34d399' : '#6583ad'} />
      <Text style={[styles.requirementText, met && styles.requirementMet]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5fbff',
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  orbTop: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    right: -90,
    top: -80,
    backgroundColor: 'rgba(14, 165, 233, 0.14)',
  },
  orbBottom: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    left: -120,
    bottom: -130,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  header: {
    marginBottom: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.16)',
    shadowColor: '#7da4c5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 4,
  },
  logoImage: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#102132',
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 12,
    color: '#0b6aa8',
    marginTop: 2,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  headerBlurb: {
    marginTop: 14,
    color: '#51687f',
    fontSize: 14,
    lineHeight: 21,
  },
  headerMetaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  headerMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: '#d7e7f2',
  },
  headerMetaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#355067',
  },
  formCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#d9e8f1',
    shadowColor: '#94a3b8',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#edf4fa',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#d6e5ef',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  toggleButtonActive: {
    backgroundColor: '#0ea5e9',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 3,
  },
  toggleText: {
    color: '#60758b',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#ffffff',
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#102132',
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 14,
    color: '#62758a',
    marginBottom: 18,
    lineHeight: 20,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9a3412',
    marginBottom: 2,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#b45309',
  },
  inputContainer: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#446079',
    marginBottom: 6,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fbfd',
    borderWidth: 1,
    borderColor: '#d6e2ed',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputWrapperFocused: {
    borderColor: '#0ea5e9',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
  inputWrapperError: {
    borderColor: '#f87171',
  },
  leftIcon: {
    marginRight: 10,
  },
  trailingIcon: {
    marginLeft: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    paddingVertical: 12,
  },
  passwordInput: {
    paddingRight: 6,
  },
  eyeButton: {
    padding: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginLeft: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#f87171',
    marginLeft: 6,
    fontWeight: '600',
  },
  strengthContainer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  strengthBarContainer: {
    flex: 1,
    height: 4,
    backgroundColor: '#dce8f1',
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: 10,
  },
  strengthBar: {
    height: '100%',
    borderRadius: 3,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 52,
    textAlign: 'right',
  },
  requirementsContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f8fbfd',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbe7ef',
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  requirementText: {
    fontSize: 12,
    color: '#698096',
    marginLeft: 8,
  },
  requirementMet: {
    color: '#34d399',
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 4,
  },
  actionButtonDisabled: {
    backgroundColor: '#93a8bb',
    opacity: 0.76,
  },
  actionButtonInactive: {
    backgroundColor: '#bfd2e0',
    opacity: 0.76,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  buttonIcon: {
    marginLeft: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
  },
  helpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0ebf2',
  },
  helpText: {
    color: '#6d8197',
    fontSize: 14,
  },
  helpLink: {
    color: '#0b6aa8',
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(224, 244, 255, 0.96)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#d4e6f2',
  },
  footerBrand: {
    color: '#0b6aa8',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  footerText: {
    fontSize: 12,
    color: '#6f859b',
    textAlign: 'center',
  },
});
