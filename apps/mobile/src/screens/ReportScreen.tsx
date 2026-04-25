import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePonds } from '../hooks/useOfflineData';
import { CONFIG } from '../config';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  'How many ponds do I have registered?',
  'Give me tips on improving water quality',
  'When is the best time to harvest?',
  'How to reduce fish mortality?',
];

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: 'Hello! I\'m your AquaPin AI Assistant. I can help you with pond management, harvest optimization, water quality advice, and more.\n\nWhat would you like to know?',
  timestamp: new Date(),
};

export default function ReportScreen() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const { ponds } = usePonds();
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        setKeyboardVisible(true);
        const windowHeight = Dimensions.get('window').height;
        const keyboardTop = event.endCoordinates?.screenY ?? windowHeight;
        const overlap = Math.max(0, windowHeight - keyboardTop);
        setKeyboardOffset(Platform.OS === 'ios' ? 0 : overlap);
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
        setKeyboardOffset(0);
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      if (!CONFIG.ai.groqApiKey) {
        throw new Error('Missing Groq API key');
      }

      const pondContext = ponds.length > 0
        ? `User has ${ponds.length} ponds: ${ponds.map((p: any) => p.name).join(', ')}.`
        : 'User has no ponds registered.';

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CONFIG.ai.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are AquaPin AI. ${pondContext} Give concise aquaculture advice.`,
            },
            ...messages.slice(-3).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: text },
          ],
          temperature: 0.7,
          max_tokens: 300,
        }),
      });

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || 'Sorry, I could not process that.';

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: CONFIG.ai.groqApiKey
          ? 'I\'m here to help with pond management! Try asking about water quality, feeding, or harvest timing.'
          : 'AI assistant is not configured yet. Add EXPO_PUBLIC_GROQ_API_KEY to your mobile .env file to enable chat.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const clearConversation = () => {
    if (messages.length <= 1) return;

    Alert.alert(
      'Clear Conversation',
      'This will remove all messages except the welcome note.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setMessages([{ ...WELCOME_MESSAGE, timestamp: new Date() }]);
            setInputText('');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Ionicons name="hardware-chip" size={28} color="#007bff" />
            <View>
              <Text style={styles.title}>AquaPin AI</Text>
              <Text style={styles.subtitle}>Your aquaculture assistant</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.pondBadge}>
              <Text style={styles.pondCount}>{ponds.length}</Text>
              <Text style={styles.pondLabel}>ponds</Text>
            </View>
            <TouchableOpacity
              style={[styles.clearButton, messages.length <= 1 && styles.clearButtonDisabled]}
              onPress={clearConversation}
              disabled={messages.length <= 1}
            >
              <Ionicons name="trash-outline" size={16} color={messages.length <= 1 ? '#9ca3af' : '#666'} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.chatArea, { paddingBottom: keyboardOffset }]}>
          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                <View style={styles.messageHeader}>
                  <Ionicons
                    name={message.role === 'user' ? 'person-circle' : 'hardware-chip'}
                    size={18}
                    color={message.role === 'user' ? '#fff' : '#007bff'}
                  />
                  <Text style={[styles.messageRole, message.role === 'user' ? styles.userRole : styles.assistantRole]}>
                    {message.role === 'user' ? 'You' : 'AquaPin AI'}
                  </Text>
                  <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
                </View>
                <Text style={[styles.messageText, message.role === 'user' ? styles.userText : styles.assistantText]}>
                  {message.content}
                </Text>
              </View>
            ))}

            {loading && (
              <View style={styles.loadingBubble}>
                <ActivityIndicator size="small" color="#007bff" />
                <Text style={styles.loadingText}>AI is thinking...</Text>
              </View>
            )}
          </ScrollView>

          <View style={[styles.inputSection, keyboardVisible && styles.inputSectionKeyboard]}>
            {!inputText && !loading && !keyboardVisible && (
              <View style={styles.suggestionsWrapper}>
                <Text style={styles.suggestionsLabel}>Quick Questions:</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
                >
                  {SUGGESTED_QUESTIONS.map((question, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.suggestionChip}
                      onPress={() => sendMessage(question)}
                    >
                      <Text style={styles.suggestionText}>{question}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.inputWrapper}>
              <View style={styles.composer}>
                <TextInput
                  style={styles.input}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Ask about your ponds..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  maxLength={500}
                  returnKeyType="send"
                  onSubmitEditing={() => sendMessage(inputText)}
                  blurOnSubmit={false}
                  editable={!loading}
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                  }}
                />
                <TouchableOpacity
                  style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
                  onPress={() => sendMessage(inputText)}
                  disabled={!inputText.trim() || loading}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="arrow-up" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.disclaimer}>
                AquaPin AI can make mistakes. Always verify important information.
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardAvoidingContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e4e8',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  pondBadge: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  pondCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007bff',
  },
  pondLabel: {
    fontSize: 11,
    color: '#007bff',
  },
  clearButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f1f3f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  clearButtonDisabled: {
    backgroundColor: '#f3f4f6',
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 18,
  },
  chatArea: {
    flex: 1,
  },
  messageBubble: {
    maxWidth: '90%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007bff',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e4e8',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  messageRole: {
    fontSize: 12,
    fontWeight: '600',
  },
  userRole: {
    color: 'rgba(255,255,255,0.8)',
  },
  assistantRole: {
    color: '#007bff',
  },
  timestamp: {
    fontSize: 11,
    color: '#999',
    marginLeft: 'auto',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: '#333',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#f0f7ff',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#007bff',
  },
  inputSection: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
  },
  inputSectionKeyboard: {
    borderTopColor: 'transparent',
  },
  suggestionsWrapper: {
    paddingTop: 8,
    paddingBottom: 6,
  },
  suggestionsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  suggestionChip: {
    backgroundColor: '#e3f2fd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#007bff',
  },
  suggestionText: {
    fontSize: 13,
    color: '#007bff',
    fontWeight: '500',
  },
  inputWrapper: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  composer: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#dbe5ef',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  input: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 0,
    paddingVertical: Platform.OS === 'ios' ? 9 : 7,
    fontSize: 15,
    color: '#1a1a1a',
    maxHeight: 108,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 40,
    height: 40,
    backgroundColor: '#007bff',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007bff',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: '#d6dde6',
    shadowOpacity: 0,
    elevation: 0,
  },
  disclaimer: {
    marginTop: 5,
    fontSize: 10.5,
    lineHeight: 14,
    color: '#9aa4b2',
    textAlign: 'center',
  },
});
