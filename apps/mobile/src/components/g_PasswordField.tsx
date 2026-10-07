import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '../theme/tokens';

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  editable?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  hint?: string;
};

// Password input with an eye button that shows or hides what was typed.
export function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  editable = true,
  autoComplete,
  hint,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.control,
          focused && styles.controlFocused,
          error ? styles.controlError : null,
        ]}
      >
        <TextInput
          style={styles.input}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CB0AA"
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <TouchableOpacity
          style={styles.eye}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          disabled={!editable}
          onPress={() => setVisible(current => !current)}
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={colors.inkSoft}
          />
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 5,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 6,
  },
  control: {
    borderRadius: radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sage,
    minHeight: 48,
  },
  controlFocused: {
    borderColor: colors.teal,
  },
  controlError: {
    borderColor: colors.coral,
  },
  input: {
    fontFamily: fonts.body,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.ink,
  },
  eye: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: '#A7402C',
    marginTop: 5,
  },
});
